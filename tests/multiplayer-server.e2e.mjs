/* global fetch, Buffer */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { connect as connectTcp } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { env, execPath } from "node:process";
import { URL } from "node:url";
import WebSocket from "ws";
import {
  bestSetupSettlement,
  canAfford,
  costs,
  goods,
  legalRoad,
  legalSettlement,
  totalPoints,
} from "../src/forge/engine.ts";
import { vertices } from "../src/forge/board.ts";

function inbox(socket) {
  const messages = [];
  const waiters = [];
  socket.on("message", (raw) => {
    const value = JSON.parse(raw.toString());
    const index = waiters.findIndex((waiter) => waiter.type === value.type);
    if (index >= 0) waiters.splice(index, 1)[0].resolve(value);
    else messages.push(value);
  });
  return (type) => {
    const index = messages.findIndex((message) => message.type === type);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return Promise.race([
      new Promise((resolve) => waiters.push({ type, resolve })),
      delay(5000).then(() => {
        throw new Error(`Timed out waiting for ${type}`);
      }),
    ]);
  };
}

test(
  "idle connections must begin a game or search before the deadline",
  { timeout: 5000 },
  async (t) => {
    // Accelerate only the server's connection deadline for this real socket test.
    const preloader = `const original = globalThis.setTimeout;
globalThis.setTimeout = (callback, ms, ...args) => original(callback, ms === 30000 ? 200 : ms, ...args);`;
    const server = spawn(
      execPath,
      [
        "--import",
        `data:text/javascript,${encodeURIComponent(preloader)}`,
        "--experimental-strip-types",
        "server/multiplayer.mjs",
      ],
      {
        env: {
          ...env,
          PORT: "0",
          SUPABASE_URL: "",
          SUPABASE_SECRET_KEY: "",
          FORGE_ALLOWED_ORIGINS: "http://localhost:5173",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    t.after(() => server.kill());
    const [startup] = await Promise.race([
      once(server.stdout, "data"),
      delay(3000).then(() => {
        throw new Error("Server did not start");
      }),
    ]);
    const port = Number(String(startup).match(/listening on (\d+)/)?.[1]);
    assert.ok(port > 0);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
      origin: "http://localhost:5173",
    });
    t.after(() => socket.terminate());
    await once(socket, "open");
    const closed = once(socket, "close");
    const [code] = await Promise.race([
      closed,
      delay(1000).then(() => {
        throw new Error("Idle connection was not closed");
      }),
    ]);
    assert.equal(code, 1008);

    const searching = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
      origin: "http://localhost:5173",
    });
    t.after(() => searching.terminate());
    const next = inbox(searching);
    await once(searching, "open");
    searching.send(JSON.stringify({ type: "findMatch" }));
    await next("waiting");
    await delay(400);
    assert.equal(
      searching.readyState,
      WebSocket.OPEN,
      "Searching players remain connected",
    );
    const searchingClosed = once(searching, "close");
    searching.send(JSON.stringify({ type: "cancelSearch" }));
    await next("search-cancelled");
    const [cancelCode] = await Promise.race([
      searchingClosed,
      delay(1000).then(() => {
        throw new Error(
          "Cancelled search did not restore the connection deadline",
        );
      }),
    ]);
    assert.equal(cancelCode, 1008);
  },
);

test(
  "two matched players choose starting settlements and play an online game to victory",
  { timeout: 120000 },
  async (t) => {
    // The production server owns dice rolls. This test-only preloader fixes the
    // dice at 3 + 4, exercising the supply rule without changing server code.
    const preloader = `import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
let index = 0;
crypto.randomInt = () => (index++ % 2 ? 4 : 3);
syncBuiltinESMExports();`;
    const server = spawn(
      execPath,
      [
        "--import",
        `data:text/javascript,${encodeURIComponent(preloader)}`,
        "--experimental-strip-types",
        "server/multiplayer.mjs",
      ],
      {
        env: {
          ...env,
          PORT: "0",
          SUPABASE_URL: "",
          SUPABASE_SECRET_KEY: "",
          FORGE_ALLOWED_ORIGINS: "http://localhost:5173",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    t.after(() => server.kill());
    const [startup] = await Promise.race([
      once(server.stdout, "data"),
      delay(5000).then(() => {
        throw new Error("Server did not start");
      }),
    ]);
    const port = Number(String(startup).match(/listening on (\d+)/)?.[1]);
    assert.ok(port > 0);
    const clients = [0, 1].map(() => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
        origin: "http://localhost:5173",
      });
      t.after(() => socket.terminate());
      return { socket, next: inbox(socket) };
    });
    await Promise.all(clients.map(({ socket }) => once(socket, "open")));
    clients[0].socket.send(JSON.stringify({ type: "findMatch" }));
    await clients[0].next("waiting");
    clients[1].socket.send(JSON.stringify({ type: "findMatch" }));
    let states = await Promise.all(clients.map(({ next }) => next("state")));
    assert.equal(states[0].session.game.phase, "setup");
    assert.deepEqual(
      states[0].session.game.players.map((p) => p.settlements),
      [[], []],
    );
    let commands = 0;
    const play = async (seat, command) => {
      // Stay under the same rate limit imposed on real clients.
      await delay(125);
      clients[seat].socket.send(
        JSON.stringify({
          type: "command",
          revision: states[seat].session.revision,
          command,
        }),
      );
      states = await Promise.all(clients.map(({ next }) => next("state")));
      assert.equal(states[0].session.revision, states[1].session.revision);
      commands++;
    };
    for (const seat of [0, 1]) {
      const game = states[seat].session.game;
      assert.equal(game.turn, seat);
      await play(seat, {
        type: "build",
        building: "settlement",
        at: bestSetupSettlement(game),
      });
    }
    assert.equal(states[0].session.game.phase, "roll");
    let turns = 0;
    while (states[0].session.game.phase !== "end" && turns < 200) {
      let game = states[0].session.game;
      const seat = game.turn;
      await play(seat, { type: "roll" });
      game = states[seat].session.game;
      assert.equal(game.dice, 7);
      const player = game.players[seat];
      const city = player.settlements[0];
      const settlement = vertices.find((vertex) =>
        legalSettlement(game, vertex.id),
      );
      const edge = vertices.flatMap((vertex) =>
        vertex.neighbors
          .filter((id) => id > vertex.id && legalRoad(game, vertex.id, id))
          .map((id) => [vertex.id, id]),
      )[0];
      if (city !== undefined && canAfford(player.hand, costs.city)) {
        await play(seat, { type: "build", building: "city", at: city });
      } else if (settlement && canAfford(player.hand, costs.settlement)) {
        await play(seat, {
          type: "build",
          building: "settlement",
          at: settlement.id,
        });
      } else if (edge && canAfford(player.hand, costs.road)) {
        await play(seat, {
          type: "build",
          building: "road",
          at: edge[0],
          to: edge[1],
        });
      } else {
        if (
          goods.reduce(
            (total, resource) => total + player.hand[resource],
            0,
          ) === 7
        ) {
          const discard =
            goods.find((resource) => player.hand[resource] > 1) ??
            goods.find((resource) => player.hand[resource] > 0);
          await play(seat, { type: "discard", resource: discard });
        }
        await play(seat, { type: "endTurn" });
      }
      turns++;
    }
    const finalGames = states.map(({ session }) => session.game);
    assert.ok(
      turns < 200,
      `Game did not finish after ${turns} turns and ${commands} commands`,
    );
    assert.equal(finalGames[0].phase, "end");
    assert.equal(finalGames[1].phase, "end");
    assert.equal(finalGames[0].winner, finalGames[1].winner);
    assert.ok(finalGames[0].winner === 0 || finalGames[0].winner === 1);
    assert.ok(totalPoints(finalGames[0], finalGames[0].winner) >= 5);
    t.diagnostic(
      `Controlled game: Player ${finalGames[0].winner + 1} won in ${turns} turns (${commands} commands).`,
    );
  },
);

test(
  "two players join, take turns, trade and observe disconnects",
  { timeout: 20000 },
  async (t) => {
    const server = spawn(
      execPath,
      ["--experimental-strip-types", "server/multiplayer.mjs"],
      {
        env: {
          ...env,
          PORT: "0",
          SUPABASE_URL: "",
          SUPABASE_SECRET_KEY: "",
          FORGE_ALLOWED_ORIGINS: "http://localhost:5173",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    t.after(() => server.kill());
    const [startup] = await Promise.race([
      once(server.stdout, "data"),
      delay(5000).then(() => {
        throw new Error("Server did not start");
      }),
    ]);
    const port = Number(String(startup).match(/listening on (\d+)/)?.[1]);
    assert.ok(port > 0);
    const malformed = connectTcp(port, "127.0.0.1");
    await once(malformed, "connect");
    malformed.write(
      "GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nOrigin: http://localhost:5173\r\n\r\n",
    );
    await Promise.race([
      new Promise((resolve) => {
        malformed.on("error", resolve);
        malformed.on("close", resolve);
      }),
      delay(1500),
    ]);
    malformed.destroy();
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
    const host = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
      origin: "http://localhost:5173",
    });
    const hostNext = inbox(host);
    t.after(() => host.terminate());
    await once(host, "open");
    host.send(JSON.stringify({ type: "create", nickname: "AmberFox#1234" }));
    const { room } = await hostNext("created");
    const guest = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
      origin: "http://localhost:5173",
    });
    const guestNext = inbox(guest);
    t.after(() => guest.terminate());
    await once(guest, "open");
    guest.send(
      JSON.stringify({ type: "join", room, nickname: "SilverWolf#5678" }),
    );
    const initialHost = await hostNext("state");
    const initialGuest = await guestNext("state");
    assert.deepEqual(initialHost.session.names, [
      "AmberFox#1234",
      "SilverWolf#5678",
    ]);
    assert.deepEqual(initialGuest.session.names, initialHost.session.names);
    assert.equal(initialHost.seat, 0);
    assert.equal(initialGuest.seat, 1);
    assert.equal(initialGuest.session.game.players[0].hand.wood, 0);
    assert.equal(initialGuest.session.game.players[1].hand.wood, 1);
    for (const resource of ["wood", "brick", "wheat", "ore", "sheep"]) {
      assert.equal(initialHost.session.game.players[1].hand[resource], 0);
      assert.equal(initialGuest.session.game.players[0].hand[resource], 0);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/ready`)).status, 503);
    assert.equal(initialHost.session.game.phase, "setup");
    assert.deepEqual(initialHost.session.game.players[0].settlements, []);
    assert.deepEqual(initialHost.session.game.players[1].settlements, []);
    guest.send(
      JSON.stringify({
        type: "command",
        revision: 0,
        command: { type: "roll" },
      }),
    );
    assert.match((await guestNext("error")).reason, /turn/i);
    host.send(
      JSON.stringify({
        type: "command",
        revision: 0,
        command: { type: "build", building: "settlement", at: 23 },
      }),
    );
    await hostNext("state");
    await guestNext("state");
    guest.send(
      JSON.stringify({
        type: "command",
        revision: 1,
        command: { type: "build", building: "settlement", at: 38 },
      }),
    );
    await hostNext("state");
    await guestNext("state");
    host.send(
      JSON.stringify({
        type: "command",
        revision: 2,
        command: { type: "roll" },
      }),
    );
    const rolled = await hostNext("state");
    const guestRolled = await guestNext("state");
    assert.deepEqual(rolled.session.names, initialHost.session.names);
    assert.match(rolled.activity, /^AmberFox#1234 rolled /);
    assert.equal(rolled.session.game.phase, "build");
    host.send(
      JSON.stringify({
        type: "command",
        revision: 0,
        command: { type: "roll" },
      }),
    );
    assert.match((await hostNext("error")).reason, /outdated|invalid/i);
    guest.send(
      JSON.stringify({
        type: "command",
        revision: 3,
        command: { type: "accept" },
      }),
    );
    assert.match((await guestNext("error")).reason, /no trade/i);
    host.send(
      JSON.stringify({
        type: "command",
        revision: 3,
        command: { type: "offer", give: "wood", receive: "ore" },
      }),
    );
    await hostNext("state");
    assert.equal((await guestNext("state")).session.offer.give, "wood");
    host.send(
      JSON.stringify({
        type: "command",
        revision: 4,
        command: { type: "accept" },
      }),
    );
    assert.match((await hostNext("error")).reason, /no trade/i);
    guest.send(
      JSON.stringify({
        type: "command",
        revision: 4,
        command: { type: "accept" },
      }),
    );
    const traded = await hostNext("state");
    const guestTraded = await guestNext("state");
    assert.equal(traded.session.offer, null);
    assert.equal(
      traded.session.game.players[0].hand.wood,
      rolled.session.game.players[0].hand.wood - 1,
    );
    assert.equal(
      traded.session.game.players[0].hand.ore,
      rolled.session.game.players[0].hand.ore + 1,
    );
    assert.equal(
      guestTraded.session.game.players[1].hand.wood,
      guestRolled.session.game.players[1].hand.wood + 1,
    );
    assert.equal(
      guestTraded.session.game.players[1].hand.ore,
      guestRolled.session.game.players[1].hand.ore - 1,
    );
    for (const resource of ["wood", "brick", "wheat", "ore", "sheep"]) {
      assert.equal(traded.session.game.players[1].hand[resource], 0);
      assert.equal(guestTraded.session.game.players[0].hand[resource], 0);
    }
    host.send(
      JSON.stringify({
        type: "command",
        revision: 5,
        command: { type: "endTurn" },
      }),
    );
    assert.equal((await guestNext("state")).session.game.turn, 1);
    await hostNext("state");
    guest.send(JSON.stringify({ type: "leave" }));
    const [hostClosed, guestClosed] = await Promise.all([
      hostNext("closed"),
      guestNext("closed"),
    ]);
    assert.match(hostClosed.reason, /left/i);
    assert.equal(hostClosed.code, "opponent_left");
    assert.equal(hostClosed.recoverable, false);
    assert.equal(guestClosed.code, "opponent_left");
  },
);

test(
  "automatic pairing, chat reports and authenticated reconnect",
  { timeout: 20000 },
  async (t) => {
    const server = spawn(
      execPath,
      ["--experimental-strip-types", "server/multiplayer.mjs"],
      {
        env: {
          ...env,
          PORT: "0",
          SUPABASE_URL: "",
          SUPABASE_SECRET_KEY: "",
          FORGE_ALLOWED_ORIGINS: "http://localhost:5173",
          FORGE_MODERATOR_TOKEN: "test-moderator-secret",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    t.after(() => server.kill());
    const [startup] = await Promise.race([
      once(server.stdout, "data"),
      delay(5000).then(() => {
        throw new Error("Server did not start");
      }),
    ]);
    const port = Number(String(startup).match(/listening on (\d+)/)?.[1]);
    const connect = () => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
        origin: "http://localhost:5173",
      });
      const next = inbox(socket);
      t.after(() => socket.terminate());
      return { socket, next };
    };
    const first = connect();
    await once(first.socket, "open");
    first.socket.send(JSON.stringify({ type: "findMatch" }));
    await first.next("waiting");
    const second = connect();
    await once(second.socket, "open");
    second.socket.send(JSON.stringify({ type: "findMatch" }));
    const firstCredentials = await first.next("credentials");
    const secondCredentials = await second.next("credentials");
    assert.equal(firstCredentials.room, secondCredentials.room);
    assert.notEqual(firstCredentials.token, secondCredentials.token);
    assert.equal((await first.next("state")).seat, 0);
    assert.equal((await second.next("state")).seat, 1);
    // A second connection replaces the seat. The old connection is deliberately
    // paused so it cannot process the close frame before trying another action.
    const replaced = first.socket;
    replaced.pause();
    const replacement = connect();
    await once(replacement.socket, "open");
    replacement.socket.send(
      JSON.stringify({
        type: "resume",
        room: firstCredentials.room,
        token: firstCredentials.token,
      }),
    );
    assert.equal(
      (await replacement.next("credentials")).room,
      firstCredentials.room,
    );
    await replacement.next("state");
    await second.next("state");
    let staleCommandReachedPeer = false;
    const detectStaleCommand = (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === "state" && data.session.revision > 0)
        staleCommandReachedPeer = true;
    };
    second.socket.on("message", detectStaleCommand);
    replaced.send(
      JSON.stringify({
        type: "command",
        revision: 0,
        command: { type: "build", building: "settlement", at: 23 },
      }),
    );
    await delay(150);
    second.socket.off("message", detectStaleCommand);
    assert.equal(
      staleCommandReachedPeer,
      false,
      "A replaced socket must not act for its old seat",
    );
    replaced.terminate();
    first.socket = replacement.socket;
    first.next = replacement.next;
    const chatMessage = {
      type: "chat",
      text: "Hello opponent",
      requestId: "retry-1",
    };
    first.socket.send(JSON.stringify(chatMessage));
    const firstChat = await first.next("chat");
    const secondChat = await second.next("chat");
    assert.equal(firstChat.id, secondChat.id);
    assert.equal(secondChat.text, "Hello opponent");
    assert.equal((await first.next("chat-result")).ok, true);
    let duplicateDelivered = false;
    const detectDuplicate = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "chat" && message.id === secondChat.id)
        duplicateDelivered = true;
    };
    second.socket.on("message", detectDuplicate);
    first.socket.send(JSON.stringify(chatMessage));
    assert.equal((await first.next("chat-result")).ok, true);
    assert.equal((await first.next("chat")).id, firstChat.id);
    await delay(100);
    second.socket.off("message", detectDuplicate);
    assert.equal(duplicateDelivered, false);
    first.socket.send(
      JSON.stringify({ ...chatMessage, text: "Changed message" }),
    );
    assert.equal((await first.next("chat-result")).ok, false);
    second.socket.send(JSON.stringify({ type: "report", id: secondChat.id }));
    assert.equal((await second.next("reported")).id, secondChat.id);
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/moderation/reports`)).status,
      403,
    );
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/moderation/reports`, {
          headers: { authorization: "test-moderator-secret" },
        })
      ).status,
      403,
    );
    const response = await fetch(
      `http://127.0.0.1:${port}/moderation/reports`,
      { headers: { authorization: "Bearer test-moderator-secret" } },
    );
    assert.equal(response.status, 200);
    const report = (await response.json()).reports[0];
    assert.equal(report.text, "Hello opponent");
    const reviewUrl = `http://127.0.0.1:${port}/moderation/reports/review`;
    const reviewBody = JSON.stringify({
      room: report.room,
      message: report.id,
      reporter: report.reporter,
    });
    assert.equal(
      (await fetch(reviewUrl, { method: "POST", body: reviewBody })).status,
      403,
    );
    assert.equal(
      (
        await fetch(reviewUrl, {
          method: "POST",
          headers: { authorization: "Bearer test-moderator-secret" },
          body: "invalid",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(reviewUrl, {
          method: "POST",
          headers: { authorization: "Bearer test-moderator-secret" },
          body: reviewBody,
        })
      ).status,
      200,
    );
    const reviewed = await fetch(
      `http://127.0.0.1:${port}/moderation/reports`,
      { headers: { authorization: "Bearer test-moderator-secret" } },
    );
    assert.ok((await reviewed.json()).reports[0].reviewedAt);
    const dashboard = await fetch(`http://127.0.0.1:${port}/moderation`);
    assert.equal(dashboard.status, 200);
    assert.match(
      dashboard.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    second.socket.close();
    await first.next("peer-disconnected");
    first.socket.send(
      JSON.stringify({
        type: "command",
        revision: 0,
        command: { type: "build", building: "settlement", at: 23 },
      }),
    );
    assert.match((await first.next("error")).reason, /reconnect/i);
    const intruder = connect();
    await once(intruder.socket, "open");
    intruder.socket.send(
      JSON.stringify({
        type: "resume",
        room: secondCredentials.room,
        token: "incorrect",
      }),
    );
    assert.match(
      (await intruder.next("closed")).reason,
      /no longer available/i,
    );
    const resumed = connect();
    await once(resumed.socket, "open");
    resumed.socket.send(
      JSON.stringify({
        type: "resume",
        room: secondCredentials.room,
        token: secondCredentials.token,
      }),
    );
    assert.equal(
      (await resumed.next("credentials")).room,
      secondCredentials.room,
    );
    await first.next("peer-reconnected");
    assert.equal((await resumed.next("state")).session.revision, 0);
    await first.next("state");
    assert.equal((await resumed.next("chat")).text, "Hello opponent");
    first.socket.send(
      JSON.stringify({
        type: "command",
        revision: 0,
        command: { type: "build", building: "settlement", at: 23 },
      }),
    );
    assert.equal((await resumed.next("state")).session.revision, 1);

    // A tab or browser can disappear without sending a graceful close frame.
    // The remaining player must be notified and the seat must remain resumable.
    first.socket.terminate();
    await resumed.next("peer-disconnected");
    const reconnected = connect();
    await once(reconnected.socket, "open");
    reconnected.socket.send(
      JSON.stringify({
        type: "resume",
        room: firstCredentials.room,
        token: firstCredentials.token,
      }),
    );
    await reconnected.next("credentials");
    await resumed.next("peer-reconnected");
    assert.equal((await reconnected.next("state")).session.revision, 1);
    assert.equal((await resumed.next("state")).session.revision, 1);

    // The remaining player can leave while waiting instead of being stuck.
    resumed.socket.terminate();
    await reconnected.next("peer-disconnected");
    reconnected.socket.send(JSON.stringify({ type: "leave" }));
    assert.equal((await reconnected.next("closed")).code, "opponent_left");
  },
);

test(
  "saved rooms and reports survive a service restart",
  { timeout: 30000 },
  async (t) => {
    const roomRows = new Map();
    const reportRows = new Map();
    let failRoomWrites = false;
    const database = createServer(async (request, response) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/auth/v1/user") {
        response.setHeader("Content-Type", "application/json");
        if (
          request.headers.apikey === "local-test-public" &&
          request.headers.authorization === "Bearer valid-test-token"
        ) {
          response.writeHead(200).end(
            JSON.stringify({
              id: "3a3058ff-1424-4cc9-9587-96f19eb23161",
              user_metadata: { display_name: "Player One" },
              app_metadata: {},
              aud: "authenticated",
            }),
          );
        } else
          response
            .writeHead(401)
            .end(JSON.stringify({ message: "Invalid token" }));
        return;
      }
      const reportsTable = url.pathname.endsWith("/forge_chat_reports");
      const rows = reportsTable ? reportRows : roomRows;
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      response.setHeader("Content-Type", "application/json");
      if (request.headers.apikey !== "local-test-secret") {
        response.writeHead(401).end("{}");
        return;
      }
      if (request.method === "POST") {
        if (!reportsTable && failRoomWrites) {
          response
            .writeHead(503)
            .end(JSON.stringify({ message: "Storage unavailable" }));
          return;
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const value = Array.isArray(body) ? body[0] : body;
        rows.set(
          reportsTable
            ? `${value.room_id}:${value.message_id}:${value.reporter_seat}`
            : value.id,
          value,
        );
        response.writeHead(204).end();
      } else if (request.method === "PATCH" && reportsTable) {
        const room = url.searchParams.get("room_id")?.slice(3);
        const message = url.searchParams.get("message_id")?.slice(3);
        const reporter = url.searchParams.get("reporter_seat")?.slice(3);
        const key = `${room}:${message}:${reporter}`;
        const originalReport = rows.get(key);
        if (!originalReport) {
          response.writeHead(200).end("[]");
          return;
        }
        const value = {
          ...originalReport,
          ...JSON.parse(Buffer.concat(chunks).toString()),
        };
        rows.set(key, value);
        response
          .writeHead(200)
          .end(JSON.stringify([{ room_id: value.room_id }]));
      } else if (request.method === "GET") {
        const filter = url.searchParams.get("id");
        const values = filter
          ? [rows.get(filter.slice(3))].filter(Boolean)
          : [...rows.values()];
        response.writeHead(200).end(JSON.stringify(values));
      } else if (request.method === "DELETE") {
        const filter = url.searchParams.get("id");
        if (filter) rows.delete(filter.slice(3));
        response.writeHead(204).end();
      } else response.writeHead(405).end();
    });
    database.listen(0, "127.0.0.1");
    await once(database, "listening");
    t.after(() => database.close());
    const dbUrl = `http://127.0.0.1:${database.address().port}`;
    async function startServer() {
      const server = spawn(
        execPath,
        ["--experimental-strip-types", "server/multiplayer.mjs"],
        {
          env: {
            ...env,
            PORT: "0",
            SUPABASE_URL: dbUrl,
            SUPABASE_SECRET_KEY: "local-test-secret",
            SUPABASE_PUBLISHABLE_KEY: "local-test-public",
            FORGE_MODERATOR_TOKEN: "moderator-test",
            FORGE_ALLOWED_ORIGINS: "http://localhost:5173",
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      t.after(() => server.kill());
      const [startup] = await Promise.race([
        once(server.stdout, "data"),
        delay(5000).then(() => {
          throw new Error("Server did not start");
        }),
      ]);
      const port = Number(String(startup).match(/listening on (\d+)/)?.[1]);
      assert.ok(port > 0);
      return { server, port };
    }
    function connect(port) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
        origin: "http://localhost:5173",
      });
      const next = inbox(socket);
      t.after(() => socket.terminate());
      return { socket, next };
    }
    const original = await startServer();
    assert.equal(
      (await fetch(`http://127.0.0.1:${original.port}/ready`)).status,
      200,
    );
    const invalid = connect(original.port);
    await once(invalid.socket, "open");
    invalid.socket.send(
      JSON.stringify({ type: "findMatch", accessToken: "invalid-test-token" }),
    );
    assert.match(
      (await invalid.next("error")).reason,
      /could not be verified/i,
    );
    const first = connect(original.port);
    await once(first.socket, "open");
    first.socket.send(
      JSON.stringify({ type: "findMatch", accessToken: "valid-test-token" }),
    );
    await first.next("waiting");
    const duplicate = connect(original.port);
    await once(duplicate.socket, "open");
    duplicate.socket.send(
      JSON.stringify({ type: "findMatch", accessToken: "valid-test-token" }),
    );
    assert.match((await duplicate.next("error")).reason, /already searching/i);
    const second = connect(original.port);
    await once(second.socket, "open");
    second.socket.send(JSON.stringify({ type: "findMatch" }));
    const firstCredentials = await first.next("credentials");
    const secondCredentials = await second.next("credentials");
    await first.next("state");
    await second.next("state");
    first.socket.send(
      JSON.stringify({
        type: "command",
        revision: 0,
        command: { type: "build", building: "settlement", at: 23 },
      }),
    );
    assert.equal((await first.next("state")).session.revision, 1);
    await second.next("state");
    first.socket.send(JSON.stringify({ type: "chat", text: "Test message" }));
    const chat = await second.next("chat");
    await first.next("chat");
    second.socket.send(JSON.stringify({ type: "report", id: chat.id }));
    await second.next("reported");
    const reviewResponse = await fetch(
      `http://127.0.0.1:${original.port}/moderation/reports/review`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer moderator-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          room: firstCredentials.room,
          message: chat.id,
          reporter: 1,
        }),
      },
    );
    assert.equal(reviewResponse.status, 200);
    const reviewedAt = reportRows.get(
      `${firstCredentials.room}:${chat.id}:1`,
    ).reviewed_at;
    assert.equal(typeof reviewedAt, "number");
    const row = roomRows.get(firstCredentials.room);
    assert.ok(row);
    assert.notEqual(row.token_hashes[0], firstCredentials.token);
    assert.notEqual(row.token_hashes[1], secondCredentials.token);
    assert.equal(row.session.revision, 1);
    assert.equal(row.player_one, "3a3058ff-1424-4cc9-9587-96f19eb23161");
    original.server.kill();
    await once(original.server, "exit");
    const restarted = await startServer();
    const restoredFirst = connect(restarted.port);
    const restoredSecond = connect(restarted.port);
    await Promise.all([
      once(restoredFirst.socket, "open"),
      once(restoredSecond.socket, "open"),
    ]);
    restoredFirst.socket.send(
      JSON.stringify({
        type: "join",
        room: "another-invitation",
        accessToken: "valid-test-token",
      }),
    );
    await restoredFirst.next("account-game-found");
    restoredSecond.socket.send(
      JSON.stringify({
        type: "resume",
        room: secondCredentials.room,
        token: secondCredentials.token,
      }),
    );
    const recoveredCredentials = await restoredFirst.next("credentials");
    assert.equal(recoveredCredentials.room, firstCredentials.room);
    assert.notEqual(recoveredCredentials.token, firstCredentials.token);
    await restoredSecond.next("credentials");
    assert.equal((await restoredFirst.next("state")).session.revision, 1);
    assert.equal((await restoredSecond.next("state")).session.revision, 1);
    assert.equal((await restoredSecond.next("chat")).text, "Test message");
    const obsolete = connect(restarted.port);
    await once(obsolete.socket, "open");
    obsolete.socket.send(
      JSON.stringify({
        type: "resume",
        room: firstCredentials.room,
        token: firstCredentials.token,
      }),
    );
    assert.match(
      (await obsolete.next("closed")).reason,
      /no longer available/i,
    );
    const reportResponse = await fetch(
      `http://127.0.0.1:${restarted.port}/moderation/reports`,
      { headers: { authorization: "Bearer moderator-test" } },
    );
    const restoredReport = (await reportResponse.json()).reports[0];
    assert.equal(restoredReport.message, "Test message");
    assert.equal(restoredReport.reviewed_at, reviewedAt);
    failRoomWrites = true;
    restoredSecond.socket.send(
      JSON.stringify({
        type: "command",
        revision: 1,
        command: { type: "build", building: "settlement", at: 38 },
      }),
    );
    assert.match(
      (await restoredFirst.next("closed")).reason,
      /storage is unavailable/i,
    );
    assert.match(
      (await restoredSecond.next("closed")).reason,
      /storage is unavailable/i,
    );
  },
);

test(
  "a cancelled search is removed before later players match",
  { timeout: 20000 },
  async (t) => {
    const server = spawn(
      execPath,
      ["--experimental-strip-types", "server/multiplayer.mjs"],
      {
        env: {
          ...env,
          PORT: "0",
          SUPABASE_URL: "",
          SUPABASE_SECRET_KEY: "",
          FORGE_ALLOWED_ORIGINS: "http://localhost:5173",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    t.after(() => server.kill());
    const [startup] = await Promise.race([
      once(server.stdout, "data"),
      delay(5000).then(() => {
        throw new Error("Server did not start");
      }),
    ]);
    const port = Number(String(startup).match(/listening on (\d+)/)?.[1]);
    assert.ok(port > 0);
    const connect = () => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
        origin: "http://localhost:5173",
      });
      const next = inbox(socket);
      t.after(() => socket.terminate());
      return { socket, next };
    };
    const cancelled = connect();
    await once(cancelled.socket, "open");
    cancelled.socket.send(JSON.stringify({ type: "findMatch" }));
    await cancelled.next("waiting");
    cancelled.socket.close();
    await once(cancelled.socket, "close");
    const first = connect();
    await once(first.socket, "open");
    first.socket.send(JSON.stringify({ type: "findMatch" }));
    await first.next("waiting");
    const second = connect();
    await once(second.socket, "open");
    second.socket.send(JSON.stringify({ type: "findMatch" }));
    const firstCredentials = await first.next("credentials");
    const secondCredentials = await second.next("credentials");
    assert.equal(firstCredentials.room, secondCredentials.room);
    assert.equal((await first.next("state")).seat, 0);
    assert.equal((await second.next("state")).seat, 1);
  },
);
