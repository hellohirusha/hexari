/* global structuredClone, console */
import { createServer } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import { env } from "node:process";
import { URL } from "node:url";
import { setInterval } from "node:timers";
import { WebSocketServer, WebSocket } from "ws";
import { newGame } from "../src/forge/engine.ts";
import { applyOnlineCommand } from "../src/forge/online/session.ts";

const port = Number(env.PORT || 8787);
const allowed = (
  env.FORGE_ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim());
const rooms = new Map();
const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  } else {
    response.writeHead(404);
    response.end();
  }
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", "http://localhost");
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
function publish(room, dice) {
  room.players.forEach((socket, seat) => {
    const game = structuredClone(room.session.game);
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
      session: { ...room.session, game },
      dice,
    });
  });
}
function terminate(room, reason) {
  if (!rooms.delete(room.id)) return;
  for (const socket of room.players) {
    send(socket, { type: "closed", reason });
    socket?.close();
  }
}
sockets.on("connection", (socket) => {
  let room = null;
  let seat = -1;
  socket.alive = true;
  socket.on("pong", () => {
    socket.alive = true;
  });
  socket.on("error", () => {});
  socket.on("message", (raw, binary) => {
    if (binary) return socket.close(1003, "Text required");
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return socket.close(1007, "Invalid message");
    }
    if (!message || typeof message !== "object") return;
    if (!room && message.type === "create") {
      if (rooms.size >= 500)
        return send(socket, { type: "error", reason: "Server is full." });
      const id = randomBytes(18).toString("base64url");
      room = {
        id,
        players: [socket, null],
        session: { game: newGame(), revision: 0, offer: null },
        created: Date.now(),
      };
      rooms.set(id, room);
      seat = 0;
      send(socket, { type: "created", room: id });
      return;
    }
    if (!room && message.type === "join" && typeof message.room === "string") {
      const found = rooms.get(message.room);
      if (!found || found.players[1])
        return send(socket, {
          type: "error",
          reason: "Invite is invalid or the game is full.",
        });
      room = found;
      seat = 1;
      room.players[1] = socket;
      room.session.game.turnStarted = Date.now();
      publish(room);
      return;
    }
    if (!room || seat < 0 || message.type !== "command" || !room.players[1])
      return;
    const result = applyOnlineCommand(
      room.session,
      seat,
      message.revision,
      message.command,
      Date.now(),
      () => [randomInt(1, 7), randomInt(1, 7)],
    );
    if (!result.ok)
      return send(socket, { type: "error", reason: result.reason });
    room.session = result.session;
    publish(room, result.dice);
  });
  socket.on("close", () => {
    if (room) terminate(room, "The other player disconnected.");
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
    if (now - room.created > 7200000) {
      terminate(room, "This game has expired.");
      continue;
    }
    if (
      !room.players[1] ||
      room.session.game.phase === "end" ||
      now - room.session.game.turnStarted < 120000
    )
      continue;
    const game = room.session.game;
    if (!game.progressed && game.turn === 0 && game.phase === "roll") {
      room.session.game = { ...game, turnStarted: now };
      publish(room);
      continue;
    }
    const result = applyOnlineCommand(
      room.session,
      game.turn,
      room.session.revision,
      { type: "endTurn" },
      now,
      () => [1, 1],
    );
    if (result.ok) {
      room.session = result.session;
      publish(room);
    }
  }
}, 1000).unref();
server.listen(port, "0.0.0.0", () =>
  console.log(`Forge multiplayer listening on ${server.address().port}`),
);
