import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { env, execPath } from "node:process";
import WebSocket from "ws";

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
    const host = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
      origin: "http://localhost:5173",
    });
    const hostNext = inbox(host);
    t.after(() => host.terminate());
    await once(host, "open");
    host.send(JSON.stringify({ type: "create" }));
    const { room } = await hostNext("created");
    const guest = new WebSocket(`ws://127.0.0.1:${port}/forge`, {
      origin: "http://localhost:5173",
    });
    const guestNext = inbox(guest);
    t.after(() => guest.terminate());
    await once(guest, "open");
    guest.send(JSON.stringify({ type: "join", room }));
    const initialHost = await hostNext("state");
    const initialGuest = await guestNext("state");
    assert.equal(initialHost.seat, 0);
    assert.equal(initialGuest.seat, 1);
    assert.equal(initialGuest.session.game.players[0].hand.wood, 0);
    assert.equal(initialGuest.session.game.players[1].hand.wood, 1);
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
        command: { type: "roll" },
      }),
    );
    const rolled = await hostNext("state");
    await guestNext("state");
    assert.equal(rolled.session.game.phase, "build");
    host.send(
      JSON.stringify({
        type: "command",
        revision: 1,
        command: { type: "offer", give: "wood", receive: "ore" },
      }),
    );
    await hostNext("state");
    assert.equal((await guestNext("state")).session.offer.give, "wood");
    guest.send(
      JSON.stringify({
        type: "command",
        revision: 2,
        command: { type: "accept" },
      }),
    );
    const traded = await hostNext("state");
    await guestNext("state");
    assert.equal(traded.session.offer, null);
    host.send(
      JSON.stringify({
        type: "command",
        revision: 3,
        command: { type: "endTurn" },
      }),
    );
    assert.equal((await guestNext("state")).session.game.turn, 1);
    await hostNext("state");
    guest.close();
    assert.match((await hostNext("closed")).reason, /disconnected/i);
  },
);
