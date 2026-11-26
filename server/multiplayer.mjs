/* global structuredClone, console, setTimeout, clearTimeout */
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { env } from "node:process";
import { URL } from "node:url";
import { setInterval } from "node:timers";
import { WebSocketServer, WebSocket } from "ws";
import { boardVersion, newGame } from "../src/forge/engine.ts";
import { migrateOpeningGame } from "../src/forge/openingMigration.ts";
import {
  isGeneratedNickname,
  nicknameFromSeed,
} from "../src/forge/nickname.ts";
import {
  applyOnlineCommand,
  timeoutOnlineTurn,
} from "../src/forge/online/session.ts";
import { createRoomStore, roomSnapshot, tokenHash } from "./roomStore.mjs";
import { createIdentityVerifier } from "./identity.mjs";
import { moderationHtml, moderationScript } from "./moderationPage.mjs";

const port = Number(env.PORT || 8787);
const allowed = (
  env.FORGE_ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim());
const rooms = new Map();
const waiting = [];
const reports = [];
const storage = createRoomStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  timeoutMs: Number(env.FORGE_STORAGE_TIMEOUT_MS),
});
const verifyIdentity = createIdentityVerifier({
  url: env.SUPABASE_URL,
  publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
});
const loadingRooms = new Map();
const checkingUsers = new Set();
const resumeGrace = 60000;
const hash = (value) => createHash("sha256").update(value).digest();
const randomNickname = () => nicknameFromSeed(randomBytes(4).readUInt32BE());
const playerNickname = (identity, proposed) =>
  identity?.displayName ||
  (identity?.id ? nicknameFromSeed(hash(identity.id).readUInt32BE()) : null) ||
  (isGeneratedNickname(proposed) ? proposed : randomNickname());
function ensureRoomNames(room) {
  if (
    !Array.isArray(room.session.names) ||
    room.session.names.length !== 2 ||
    !room.session.names.every((name) => typeof name === "string")
  )
    room.session.names = room.users.map((user) => playerNickname(user));
}
const server = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  } else if (request.url === "/ready") {
    try {
      if (!storage || !env.SUPABASE_PUBLISHABLE_KEY)
        throw new Error(
          "Online storage and authentication are not configured.",
        );
      await storage.ready();
      response.writeHead(200, {
        "content-type": "text/plain",
        "cache-control": "no-store",
      });
      response.end("ok");
    } catch {
      response.writeHead(503, {
        "content-type": "text/plain",
        "cache-control": "no-store",
      });
      response.end("not ready");
    }
  } else if (
    request.method === "GET" &&
    ["/moderation", "/moderation/app.js"].includes(request.url)
  ) {
    response.writeHead(200, {
      "content-type": request.url.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    response.end(
      request.url.endsWith(".js") ? moderationScript : moderationHtml,
    );
  } else if (
    (request.url === "/moderation/reports" && request.method === "GET") ||
    (request.url === "/moderation/reports/review" && request.method === "POST")
  ) {
    const token = env.FORGE_MODERATOR_TOKEN;
    const authorization = request.headers.authorization ?? "";
    const supplied = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    if (!token || !timingSafeEqual(hash(token), hash(supplied))) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      if (request.method === "POST") {
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 1024) {
            response.writeHead(413);
            response.end();
            return;
          }
        }
        let input;
        try {
          input = JSON.parse(body);
        } catch {
          response.writeHead(400);
          response.end();
          return;
        }
        if (
          !input ||
          typeof input.room !== "string" ||
          !/^[A-Za-z0-9_-]{1,32}$/.test(input.room) ||
          typeof input.message !== "string" ||
          !/^[A-Za-z0-9_-]{1,32}$/.test(input.message) ||
          ![0, 1].includes(input.reporter)
        ) {
          response.writeHead(400);
          response.end();
          return;
        }
        const now = Date.now();
        const found = storage
          ? await storage.reviewReport(
              input.room,
              input.message,
              input.reporter,
              now,
            )
          : (() => {
              const report = reports.find(
                (entry) =>
                  entry.room === input.room &&
                  entry.id === input.message &&
                  entry.reporter === input.reporter,
              );
              if (!report) return false;
              report.reviewedAt = now;
              return true;
            })();
        response.writeHead(found ? 200 : 404, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(JSON.stringify({ ok: found }));
        return;
      }
      const result = storage ? await storage.reports() : reports;
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ reports: result }));
    } catch {
      response.writeHead(503, { "cache-control": "no-store" });
      response.end();
    }
  } else {
    response.writeHead(404);
    response.end();
  }
});
server.maxConnections = 1000;
const sockets = new WebSocketServer({ noServer: true, maxPayload: 16384 });
server.on("upgrade", (request, socket, head) => {
  let url;
  try {
    url = new URL(request.url || "/", "http://localhost");
  } catch {
    socket.destroy();
    return;
  }
  if (url.pathname !== "/forge" || !allowed.includes(request.headers.origin)) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (ws) =>
    sockets.emit("connection", ws),
  );
});

function send(socket, payload) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(payload));
}
function publish(room, dice, activity, snapshot = room.session, publicAction) {
  room.players.forEach((socket, seat) => {
    const game = structuredClone(snapshot.game);
    game.players[1 - seat].hand = {
      wood: 0,
      brick: 0,
      wheat: 0,
      ore: 0,
      sheep: 0,
    };
    send(socket, {
      type: "state",
      seat,
      session: { ...snapshot, game },
      dice,
      activity,
      publicAction,
    });
  });
}
function credentials(room, seat) {
  send(room.players[seat], {
    type: "credentials",
    room: room.id,
    token: room.tokens[seat],
  });
}
function newRoom() {
  const tokens = [
    randomBytes(32).toString("base64url"),
    randomBytes(32).toString("base64url"),
  ];
  return {
    id: randomBytes(18).toString("base64url"),
    players: [null, null],
    tokens,
    tokenHashes: tokens.map(tokenHash),
    users: [null, null],
    session: {
      game: newGame(Date.now(), { manualSetup: true }),
      revision: 0,
      offer: null,
      names: [randomNickname(), randomNickname()],
    },
    created: Date.now(),
    chat: [],
    started: false,
    suspendedAt: null,
    reconnectDeadline: null,
    persisted: false,
    lastCheckpoint: Date.now(),
  };
}
function persistThen(room, callback) {
  if (!storage) {
    callback();
    return;
  }
  const snapshot = roomSnapshot(room, Date.now());
  const previous = room.storageQueue ?? Promise.resolve(true);
  room.storageQueue = previous.then(async (ok) => {
    if (!ok || !rooms.has(room.id)) return false;
    try {
      await storage.save(snapshot);
      room.persisted = true;
      room.lastCheckpoint = snapshot.updated_at;
      if (rooms.has(room.id)) callback(snapshot.session);
      return true;
    } catch {
      terminate(
        room,
        room.persisted
          ? "Game paused because storage is unavailable. Resume from the last saved state."
          : "Game storage failed. The match could not be saved.",
        room.persisted,
      );
      return false;
    }
  });
}
async function loadRoom(id) {
  const existing = rooms.get(id);
  if (existing || !storage) return existing;
  if (!loadingRooms.has(id)) {
    loadingRooms.set(
      id,
      (async () => {
        const row = await storage.load(id);
        if (
          !row ||
          !row.started ||
          row.closed ||
          row.expires_at <= Date.now() ||
          !Array.isArray(row.token_hashes) ||
          row.token_hashes.length !== 2 ||
          !row.token_hashes.every(
            (value) =>
              typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
          ) ||
          !row.session?.game ||
          row.session.game.boardVersion !== boardVersion ||
          !Array.isArray(row.session.game.players) ||
          row.session.game.players.length !== 2 ||
          !Number.isSafeInteger(row.session.revision) ||
          !Array.isArray(row.chat)
        )
          return null;
        const room = {
          id,
          players: [null, null],
          tokens: [null, null],
          tokenHashes: row.token_hashes,
          users: [
            row.player_one ? { id: row.player_one } : null,
            row.player_two ? { id: row.player_two } : null,
          ],
          session: {
            ...row.session,
            game: migrateOpeningGame(row.session.game),
          },
          created: row.created_at,
          chat: row.chat.slice(-100),
          started: true,
          suspendedAt: row.updated_at,
          reconnectDeadline: Date.now() + resumeGrace,
          persisted: true,
          lastCheckpoint: row.updated_at,
        };
        ensureRoomNames(room);
        rooms.set(id, room);
        return room;
      })().finally(() => loadingRooms.delete(id)),
    );
  }
  return loadingRooms.get(id);
}
function terminate(room, reason, retain = false, recoverable = retain, code) {
  if (!rooms.delete(room.id)) return;
  if (storage && !retain) {
    const pending = room.storageQueue ?? Promise.resolve(true);
    room.storageQueue = pending
      .then(() => storage.remove(room.id))
      .catch(() => {
        console.error("Could not remove a closed Forge room from storage.");
      });
  }
  for (const socket of room.players) {
    send(socket, {
      type: "closed",
      reason,
      recoverable,
      ...(code ? { code } : {}),
    });
    socket?.close();
  }
}
function suspendPlayer(room, seat, socket) {
  if (!rooms.has(room.id) || room.players[seat] !== socket) return;
  room.players[seat] = null;
  if (!room.started) return terminate(room, "The other player disconnected.");
  if (!room.suspendedAt) {
    room.suspendedAt = Date.now();
    room.reconnectDeadline = room.suspendedAt + resumeGrace;
  }
  persistThen(room, () => {});
  for (const player of room.players)
    send(player, { type: "peer-disconnected" });
}
sockets.on("connection", (socket) => {
  let room = null;
  let seat = -1;
  let searching = false;
  let windowStart = Date.now();
  let messageCount = 0;
  let chatWindowStart = Date.now();
  let chatCount = 0;
  let resuming = false;
  let identity = null;
  let prejoinTimer;
  let forcedCloseTimer;
  const armPrejoinDeadline = () => {
    clearTimeout(prejoinTimer);
    prejoinTimer = setTimeout(() => {
      if (room || searching) return;
      socket.close(1008, "Begin a game or search.");
      // A malicious client can ignore the close frame, so release the slot.
      forcedCloseTimer = setTimeout(() => socket.terminate(), 1000);
      forcedCloseTimer.unref();
    }, 30000);
    prejoinTimer.unref();
  };
  const attach = (nextRoom, nextSeat) => {
    clearTimeout(prejoinTimer);
    room = nextRoom;
    seat = nextSeat;
    searching = false;
    nextRoom.players[nextSeat] = socket;
  };
  armPrejoinDeadline();
  socket.alive = true;
  socket.on("pong", () => {
    socket.alive = true;
  });
  socket.on("error", () => {});
  socket.on("message", async (raw, binary) => {
    const now = Date.now();
    if (now - windowStart >= 10000) {
      windowStart = now;
      messageCount = 0;
    }
    if (++messageCount > 60) return socket.close(1008, "Too many messages");
    if (binary) return socket.close(1003, "Text required");
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return socket.close(1007, "Invalid message");
    }
    if (!message || typeof message !== "object") return;
    if (room && room.players[seat] !== socket)
      return socket.close(1008, "Connection replaced.");
    if (resuming) return;
    if (searching && message.type === "cancelSearch") {
      const index = waiting.findIndex((entry) => entry.socket === socket);
      if (index >= 0) waiting.splice(index, 1);
      searching = false;
      armPrejoinDeadline();
      send(socket, { type: "search-cancelled" });
      return;
    }
    if (searching && message.type !== "findMatch") return;
    if (
      !room &&
      ["create", "join"].includes(message.type) &&
      message.accessToken !== undefined
    ) {
      if (!storage || !env.SUPABASE_PUBLISHABLE_KEY)
        return send(socket, {
          type: "error",
          reason: "Account verification is not configured on this server.",
        });
      resuming = true;
      let lockedUser = null;
      try {
        identity = await verifyIdentity(message.accessToken);
        if (!identity)
          return send(socket, {
            type: "error",
            reason: "Your account could not be verified. Please sign in again.",
          });
        if (checkingUsers.has(identity.id))
          return send(socket, {
            type: "error",
            reason: "This account is already joining a game.",
          });
        checkingUsers.add(identity.id);
        lockedUser = identity.id;
        let existing = [...rooms.values()].find(
          (candidate) =>
            candidate.session.game.phase !== "end" &&
            candidate.users.some((user) => user?.id === identity.id),
        );
        if (!existing) {
          const row = await storage.findByUser(identity.id, now);
          if (row) existing = await loadRoom(row.id);
        }
        if (waiting.some((entry) => entry.identity?.id === identity.id))
          return send(socket, {
            type: "error",
            reason: "This account already has an active game or search.",
          });
        if (socket.readyState !== WebSocket.OPEN) return;
        if (existing) {
          if (!existing.started)
            return send(socket, {
              type: "error",
              reason: "This account already has an open invite.",
            });
          const claimedSeat = existing.users.findIndex(
            (user) => user?.id === identity.id,
          );
          if (claimedSeat < 0)
            return send(socket, {
              type: "error",
              reason: "Saved game ownership could not be verified.",
            });
          send(socket, { type: "account-game-found" });
          const token = randomBytes(32).toString("base64url");
          existing.tokens[claimedSeat] = token;
          existing.tokenHashes[claimedSeat] = tokenHash(token);
          existing.users[claimedSeat] = identity;
          message = { type: "resume", room: existing.id, token };
        }
      } catch {
        return send(socket, {
          type: "error",
          reason: "Could not verify your account or saved games. Try again.",
        });
      } finally {
        if (lockedUser) checkingUsers.delete(lockedUser);
        resuming = false;
      }
    }
    if (
      !room &&
      !searching &&
      message.type === "findMatch" &&
      message.accessToken !== undefined
    ) {
      if (!storage || !env.SUPABASE_PUBLISHABLE_KEY)
        return send(socket, {
          type: "error",
          reason: "Account verification is not configured on this server.",
        });
      resuming = true;
      let lockedUser = null;
      try {
        identity = await verifyIdentity(message.accessToken);
        if (!identity)
          return send(socket, {
            type: "error",
            reason: "Your account could not be verified. Please sign in again.",
          });
        if (checkingUsers.has(identity.id))
          return send(socket, {
            type: "error",
            reason: "This account is already joining a game.",
          });
        checkingUsers.add(identity.id);
        lockedUser = identity.id;
        if (waiting.some((entry) => entry.identity?.id === identity.id))
          return send(socket, {
            type: "error",
            reason: "This account is already searching for a game.",
          });
        if (
          [...rooms.values()].some(
            (candidate) =>
              !candidate.started &&
              candidate.users.some((user) => user?.id === identity.id),
          )
        )
          return send(socket, {
            type: "error",
            reason: "This account already has an open invite.",
          });
        let existing = [...rooms.values()].find(
          (candidate) =>
            candidate.started &&
            candidate.session.game.phase !== "end" &&
            candidate.users.some((user) => user?.id === identity.id),
        );
        if (!existing) {
          const row = await storage.findByUser(identity.id, now);
          if (row) existing = await loadRoom(row.id);
        }
        if (socket.readyState !== WebSocket.OPEN) return;
        if (existing) {
          send(socket, { type: "account-game-found" });
          const claimedSeat = existing.users.findIndex(
            (user) => user?.id === identity.id,
          );
          if (claimedSeat < 0)
            return send(socket, {
              type: "error",
              reason: "Saved game ownership could not be verified.",
            });
          const token = randomBytes(32).toString("base64url");
          existing.tokens[claimedSeat] = token;
          existing.tokenHashes[claimedSeat] = tokenHash(token);
          existing.users[claimedSeat] = identity;
          message = { type: "resume", room: existing.id, token };
        }
      } catch {
        return send(socket, {
          type: "error",
          reason: "Could not verify your account or saved games. Try again.",
        });
      } finally {
        if (lockedUser) checkingUsers.delete(lockedUser);
        resuming = false;
      }
    }
    if (!room && message.type === "findMatch") {
      if (searching) return;
      if (
        identity &&
        waiting.some((entry) => entry.identity?.id === identity.id)
      )
        return send(socket, {
          type: "error",
          reason: "This account is already searching for a game.",
        });
      let candidate;
      while ((candidate = waiting.shift())) {
        if (candidate.socket.readyState === WebSocket.OPEN) break;
      }
      if (!candidate || candidate.socket.readyState !== WebSocket.OPEN) {
        if (waiting.length >= 500)
          return send(socket, {
            type: "error",
            reason: "The matchmaking queue is full.",
          });
        searching = true;
        clearTimeout(prejoinTimer);
        waiting.push({
          socket,
          attach,
          identity,
          nickname: playerNickname(identity, message.nickname),
        });
        send(socket, { type: "waiting" });
        return;
      }
      if (rooms.size >= 500) {
        waiting.unshift(candidate);
        return send(socket, { type: "error", reason: "Server is full." });
      }
      const matched = newRoom();
      rooms.set(matched.id, matched);
      candidate.attach(matched, 0);
      attach(matched, 1);
      matched.users = [candidate.identity, identity];
      const otherName = playerNickname(identity, message.nickname);
      matched.session.names = [candidate.nickname, otherName];
      if (!identity && matched.session.names[0] === otherName) {
        do matched.session.names[1] = randomNickname();
        while (matched.session.names[1] === otherName);
      }
      matched.started = true;
      matched.session.game.turnStarted = Date.now();
      matched.session.game.gameStartedAt = matched.session.game.turnStarted;
      credentials(matched, 0);
      credentials(matched, 1);
      persistThen(matched, (snapshot) =>
        publish(matched, undefined, undefined, snapshot),
      );
      return;
    }
    if (
      !room &&
      message.type === "resume" &&
      typeof message.room === "string" &&
      typeof message.token === "string" &&
      message.room.length <= 32 &&
      message.token.length <= 64
    ) {
      if (resuming) return;
      resuming = true;
      let found;
      try {
        found = await loadRoom(message.room);
      } catch {
        send(socket, {
          type: "closed",
          reason: "Game storage is unavailable.",
        });
        socket.close();
        return;
      } finally {
        resuming = false;
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      const claimedSeat =
        found?.tokenHashes.findIndex((token) =>
          timingSafeEqual(
            Buffer.from(token, "hex"),
            Buffer.from(tokenHash(message.token), "hex"),
          ),
        ) ?? -1;
      if (
        !found ||
        claimedSeat < 0 ||
        !found.started ||
        (!found.players[claimedSeat] &&
          (!found.reconnectDeadline || now > found.reconnectDeadline))
      ) {
        send(socket, {
          type: "closed",
          reason: "The saved online game is no longer available.",
        });
        return socket.close();
      }
      const previous = found.players[claimedSeat];
      ensureRoomNames(found);
      if (identity) found.session.names[claimedSeat] = playerNickname(identity);
      attach(found, claimedSeat);
      found.tokens[claimedSeat] = message.token;
      if (previous) {
        send(previous, {
          type: "closed",
          reason: "Your session was resumed elsewhere.",
        });
        previous.close();
      }
      credentials(found, claimedSeat);
      if (found.players.every(Boolean)) {
        if (found.suspendedAt)
          found.session.game.turnStarted += now - found.suspendedAt;
        found.suspendedAt = null;
        found.reconnectDeadline = null;
        for (const player of found.players)
          send(player, { type: "peer-reconnected", seat: claimedSeat });
        persistThen(found, (snapshot) => {
          publish(found, undefined, undefined, snapshot);
          for (const entry of found.chat)
            send(socket, { type: "chat", ...entry });
        });
      } else {
        send(socket, { type: "peer-disconnected" });
        persistThen(found, (snapshot) => {
          publish(found, undefined, undefined, snapshot);
          for (const entry of found.chat)
            send(socket, { type: "chat", ...entry });
        });
      }
      return;
    }
    if (!room && message.type === "create") {
      if (
        rooms.size >= 500 ||
        [...rooms.values()].filter((candidate) => !candidate.started).length >=
          50
      )
        return send(socket, { type: "error", reason: "Server is full." });
      const created = newRoom();
      created.users[0] = identity;
      created.session.names[0] = playerNickname(identity, message.nickname);
      rooms.set(created.id, created);
      attach(created, 0);
      persistThen(created, () => {
        send(socket, {
          type: "created",
          room: created.id,
          nickname: created.session.names[0],
        });
        credentials(created, 0);
      });
      return;
    }
    if (!room && message.type === "join" && typeof message.room === "string") {
      const found = rooms.get(message.room);
      if (!found || found.started || found.players[1])
        return send(socket, {
          type: "error",
          reason: "Invite is invalid or the game is full.",
        });
      if (identity && found.users[0]?.id === identity.id)
        return send(socket, {
          type: "error",
          reason: "You cannot join your own game.",
        });
      attach(found, 1);
      found.users[1] = identity;
      found.session.names[1] = playerNickname(identity, message.nickname);
      if (!identity && found.session.names[1] === found.session.names[0]) {
        do found.session.names[1] = randomNickname();
        while (found.session.names[1] === found.session.names[0]);
      }
      room.started = true;
      room.session.game.turnStarted = Date.now();
      room.session.game.gameStartedAt = room.session.game.turnStarted;
      credentials(room, 1);
      persistThen(room, (snapshot) =>
        publish(room, undefined, undefined, snapshot),
      );
      return;
    }
    if (room?.closing)
      return send(socket, { type: "error", reason: "The game is closing." });
    if (room && message.type === "linkAccount") {
      if (!storage || !env.SUPABASE_PUBLISHABLE_KEY)
        return send(socket, {
          type: "error",
          reason: "Account verification is not configured on this server.",
        });
      resuming = true;
      let lockedUser = null;
      try {
        const user = await verifyIdentity(message.accessToken);
        if (!user)
          return send(socket, {
            type: "error",
            reason: "Your account could not be verified. Please sign in again.",
          });
        if (checkingUsers.has(user.id))
          return send(socket, {
            type: "error",
            reason: "This account is already joining a game.",
          });
        checkingUsers.add(user.id);
        lockedUser = user.id;
        if (
          (room.users[seat] && room.users[seat].id !== user.id) ||
          room.users[1 - seat]?.id === user.id
        )
          return send(socket, {
            type: "error",
            reason: "This seat is already associated with another account.",
          });
        const existing = await storage.findByUser(user.id, now);
        if (
          existing &&
          existing.id !== room.id &&
          existing.session?.game?.boardVersion === boardVersion
        )
          return send(socket, {
            type: "error",
            reason: "This account already has another active game.",
          });
        if (
          !rooms.has(room.id) ||
          room.players[seat] !== socket ||
          socket.readyState !== WebSocket.OPEN
        )
          return;
        room.users[seat] = user;
        ensureRoomNames(room);
        room.session.names[seat] = playerNickname(user);
        persistThen(room, (snapshot) => {
          send(socket, { type: "account-linked" });
          publish(room, undefined, undefined, snapshot);
        });
      } catch {
        send(socket, {
          type: "error",
          reason: "Could not link your account. Try again.",
        });
      } finally {
        if (lockedUser) checkingUsers.delete(lockedUser);
        resuming = false;
      }
      return;
    }
    if (room && message.type === "leave") {
      if (!storage || !room.persisted)
        return terminate(
          room,
          "The other player left the game.",
          false,
          false,
          "opponent_left",
        );
      room.closing = true;
      try {
        if (room.storageQueue) await room.storageQueue;
        if (!rooms.has(room.id)) return;
        await storage.close(room.id);
        terminate(
          room,
          "The other player left the game.",
          true,
          false,
          "opponent_left",
        );
      } catch {
        room.closing = false;
        send(socket, {
          type: "error",
          reason: "Could not leave the saved game. Please try again.",
        });
        if (socket.readyState !== WebSocket.OPEN)
          suspendPlayer(room, seat, socket);
      }
      return;
    }
    if (room?.suspendedAt) {
      const reason = "Waiting for the other player to reconnect.";
      if (
        message.type === "chat" &&
        typeof message.requestId === "string" &&
        /^[a-zA-Z0-9-]{1,64}$/.test(message.requestId)
      )
        return send(socket, {
          type: "chat-result",
          requestId: message.requestId,
          ok: false,
          reason,
        });
      return send(socket, { type: "error", reason });
    }
    if (!room || seat < 0 || message.type !== "command" || !room.players[1]) {
      if (!room || seat < 0 || !room.players[1]) return;
      if (message.type === "chat") {
        const requestId =
          typeof message.requestId === "string" &&
          /^[a-zA-Z0-9-]{1,64}$/.test(message.requestId)
            ? message.requestId
            : null;
        const rejectChat = (reason) =>
          requestId
            ? send(socket, {
                type: "chat-result",
                requestId,
                ok: false,
                reason,
              })
            : send(socket, { type: "error", reason });
        if (typeof message.text !== "string" || message.text.length > 240)
          return rejectChat("Invalid chat message.");
        const text = Array.from(message.text, (character) => {
          const code = character.codePointAt(0);
          return code < 32 || code === 127 ? " " : character;
        })
          .join("")
          .trim();
        if (!text) return rejectChat("Enter a message.");
        const existing =
          requestId &&
          room.chat.find(
            (item) => item.seat === seat && item.requestId === requestId,
          );
        if (existing) {
          if (existing.text !== text)
            return rejectChat("Message identifier already used.");
          persistThen(room, () => {
            send(socket, { type: "chat", id: existing.id, seat, text });
            send(socket, { type: "chat-result", requestId, ok: true });
          });
          return;
        }
        if (now - chatWindowStart >= 10000) {
          chatWindowStart = now;
          chatCount = 0;
        }
        if (++chatCount > 5)
          return rejectChat("Please wait before sending more messages.");
        const entry = {
          id: randomBytes(12).toString("base64url"),
          seat,
          text,
          ...(requestId ? { requestId } : {}),
        };
        room.chat.push(entry);
        if (room.chat.length > 100) room.chat.shift();
        persistThen(room, () => {
          for (const player of room.players)
            send(player, { type: "chat", id: entry.id, seat, text });
          if (requestId)
            send(socket, { type: "chat-result", requestId, ok: true });
        });
      } else if (message.type === "report" && typeof message.id === "string") {
        const entry = room.chat.find((item) => item.id === message.id);
        if (!entry)
          return send(socket, {
            type: "error",
            reason: "Message is no longer available.",
          });
        if (
          !reports.some(
            (item) => item.id === entry.id && item.reporter === seat,
          )
        ) {
          const report = {
            ...entry,
            room: room.id,
            reporter: seat,
            reportedAt: new Date().toISOString(),
          };
          if (storage) {
            try {
              await storage.report({
                room_id: room.id,
                message_id: entry.id,
                author_seat: entry.seat,
                reporter_seat: seat,
                message: entry.text,
                reported_at: now,
              });
            } catch {
              return send(socket, {
                type: "error",
                reason: "Could not submit the report. Please try again.",
              });
            }
          }
          reports.push(report);
          if (reports.length > 500) reports.shift();
        }
        send(socket, { type: "reported", id: entry.id });
      }
      return;
    }
    const previousSession = room.session;
    const result = applyOnlineCommand(
      room.session,
      seat,
      message.revision,
      message.command,
      Date.now(),
      () => [randomInt(1, 7), randomInt(1, 7)],
      () => randomInt(0, 0x100000000) / 0x100000000,
    );
    if (!result.ok)
      return send(socket, { type: "error", reason: result.reason });
    room.session = result.session;
    ensureRoomNames(room);
    const player = room.session.names[seat];
    const action = message.command;
    const publicAction =
      action.type === "build"
        ? {
            type: "build",
            actor: seat,
            building: action.building,
            setup: previousSession.game.phase === "setup",
          }
        : action.type === "bank"
          ? {
              type: "bank",
              actor: seat,
              give: action.give,
              receive: action.receive,
            }
          : action.type === "accept" && previousSession.offer
            ? {
                type: "trade",
                actor: previousSession.offer.by,
                other: seat,
                give: previousSession.offer.give,
                receive: previousSession.offer.receive,
              }
            : undefined;
    const descriptions = {
      roll: `${player} rolled ${result.dice?.reduce((total, value) => total + value, 0)}.`,
      endTurn: `${player} ended their turn.`,
      build: `${player} built a ${action.building}.`,
      bank: `${player} traded with the bank.`,
      discard: `${player} discarded a card.`,
      sevenDiscard: `${player} discarded a card.`,
      moveRobber: `${player} moved the robber.`,
      offer: `${player} offered a trade.`,
      accept: `${player} accepted the trade.`,
      decline: `${player} declined the trade.`,
    };
    persistThen(room, (snapshot) =>
      publish(
        room,
        result.dice,
        descriptions[action.type],
        snapshot,
        publicAction,
      ),
    );
  });
  socket.on("close", () => {
    clearTimeout(prejoinTimer);
    clearTimeout(forcedCloseTimer);
    if (searching) {
      const index = waiting.findIndex((entry) => entry.socket === socket);
      if (index >= 0) waiting.splice(index, 1);
    }
    if (room && !room.closing) suspendPlayer(room, seat, socket);
  });
});
setInterval(() => {
  for (const socket of sockets.clients) {
    if (!socket.alive) {
      socket.terminate();
      continue;
    }
    socket.alive = false;
    socket.ping();
  }
}, 30000).unref();
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.closing) continue;
    if (!room.started && now - room.created > 120000) {
      terminate(room, "The invitation expired.");
      continue;
    }
    if (now - room.created > 7200000) {
      terminate(room, "This game has expired.");
      continue;
    }
    if (room.reconnectDeadline && now > room.reconnectDeadline) {
      const recoverable =
        !!storage &&
        room.users.some(Boolean) &&
        room.session.game.phase !== "end";
      terminate(
        room,
        recoverable
          ? "Game paused. Search online to resume it."
          : "The other player did not reconnect in time.",
        recoverable,
        recoverable,
        "opponent_timeout",
      );
      continue;
    }
    if (
      storage &&
      !room.suspendedAt &&
      room.session.game.phase !== "end" &&
      !room.checkpointPending &&
      now - room.lastCheckpoint >= 10000
    ) {
      room.checkpointPending = true;
      persistThen(room, () => {
        room.checkpointPending = false;
      });
    }
    if (
      !room.players.every(Boolean) ||
      room.session.game.phase === "end" ||
      now - room.session.game.turnStarted < 120000
    )
      continue;
    const game = room.session.game;
    const result = timeoutOnlineTurn(room.session, now, () => [
      randomInt(1, 7),
      randomInt(1, 7),
    ]);
    if (result.ok) {
      room.session = result.session;
      persistThen(room, (snapshot) =>
        publish(
          room,
          result.dice,
          `Player ${game.turn + 1} ran out of time.`,
          snapshot,
        ),
      );
    }
  }
}, 1000).unref();
if (storage) {
  setInterval(() => {
    void storage.purgeExpired(Date.now()).catch(() => {
      console.error("Could not remove expired Forge rooms from storage.");
    });
  }, 600000).unref();
}
server.listen(port, "0.0.0.0", () =>
  console.log(`Forge multiplayer listening on ${server.address().port}`),
);
