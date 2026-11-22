import {
  goods,
  bestSetupSettlement,
  transition,
  type Building,
  type Game,
  type Goods,
} from "../engine.ts";

export type Seat = 0 | 1;
export type TradeOffer = { by: Seat; give: Goods; receive: Goods };
export type OnlineSession = {
  game: Game;
  revision: number;
  offer: TradeOffer | null;
  names?: [string, string];
};
export type OnlineCommand =
  | { type: "roll" }
  | { type: "endTurn" }
  | {
      type: "build";
      building: Building;
      at: number;
      to?: number;
    }
  | { type: "bank"; give: Goods; receive: Goods }
  | { type: "discard"; resource: Goods }
  | { type: "offer"; give: Goods; receive: Goods }
  | { type: "accept" | "decline" };

export type CommandResult =
  | { ok: true; session: OnlineSession; dice?: [number, number] }
  | { ok: false; reason: string };

/** Run on the host. Actor identity must come from the connection, not the message. */
export function applyOnlineCommand(
  session: OnlineSession,
  actor: Seat,
  revision: number,
  command: OnlineCommand,
  now: number,
  rollDice: () => [number, number],
): CommandResult {
  if (
    (actor !== 0 && actor !== 1) ||
    !Number.isSafeInteger(revision) ||
    revision !== session.revision
  )
    return { ok: false, reason: "Outdated or invalid action." };
  if (!command || typeof command !== "object" || session.game.phase === "end")
    return { ok: false, reason: "Game is not active." };
  const { game, offer } = session;
  const nextRevision = revision + 1;
  if (command.type === "accept" || command.type === "decline") {
    if (
      !offer ||
      actor === offer.by ||
      offer.by !== game.turn ||
      game.phase !== "build"
    )
      return { ok: false, reason: "No trade to answer." };
    if (command.type === "decline")
      return {
        ok: true,
        session: { ...session, game, offer: null, revision: nextRevision },
      };
    const next = transition(game, {
      type: "playerTrade",
      give: offer.give,
      receive: offer.receive,
    });
    if (next === game)
      return { ok: false, reason: "Trade is no longer available." };
    return {
      ok: true,
      session: { ...session, game: next, offer: null, revision: nextRevision },
    };
  }
  if (actor !== game.turn) return { ok: false, reason: "Not your turn." };
  if (command.type === "offer") {
    if (
      game.phase !== "build" ||
      !goods.includes(command.give) ||
      !goods.includes(command.receive) ||
      command.give === command.receive ||
      game.players[actor].hand[command.give] < 1
    )
      return { ok: false, reason: "Invalid trade offer." };
    return {
      ok: true,
      session: {
        ...session,
        game,
        revision: nextRevision,
        offer: { by: actor, give: command.give, receive: command.receive },
      },
    };
  }
  let next: Game;
  let dice: [number, number] | undefined;
  switch (command.type) {
    case "roll": {
      if (game.phase !== "roll")
        return {
          ok: false,
          reason:
            game.phase === "setup"
              ? "Place your starting settlement first."
              : "Dice already rolled.",
        };
      dice = rollDice();
      if (
        dice.length !== 2 ||
        dice.some((n) => !Number.isInteger(n) || n < 1 || n > 6)
      )
        return { ok: false, reason: "Invalid dice." };
      next = transition(game, { type: "roll", total: dice[0] + dice[1] });
      break;
    }
    case "endTurn":
      if (game.phase === "setup")
        return { ok: false, reason: "Place your starting settlement first." };
      if (game.phase === "roll")
        return { ok: false, reason: "Roll before ending your turn." };
      next = transition(game, { type: "endTurn", now });
      break;
    case "build":
      if (
        !(["road", "settlement", "city"] as const).includes(command.building) ||
        !Number.isSafeInteger(command.at) ||
        (command.to !== undefined && !Number.isSafeInteger(command.to))
      )
        return { ok: false, reason: "Invalid building." };
      next = transition(game, { ...command, now });
      break;
    case "bank":
      if (!goods.includes(command.give) || !goods.includes(command.receive))
        return { ok: false, reason: "Invalid resource." };
      next = transition(game, command);
      break;
    case "discard":
      if (!goods.includes(command.resource))
        return { ok: false, reason: "Invalid resource." };
      next = transition(game, command);
      break;
    default:
      return { ok: false, reason: "Unknown action." };
  }
  if (next === game) return { ok: false, reason: "Action is not legal." };
  return {
    ok: true,
    session: { ...session, game: next, revision: nextRevision, offer: null },
    ...(dice ? { dice } : {}),
  };
}

/** On a timeout, roll first when necessary, then pass the turn. */
export function timeoutOnlineTurn(
  session: OnlineSession,
  now: number,
  rollDice: () => [number, number],
): CommandResult {
  if (session.game.phase === "setup") {
    const at = bestSetupSettlement(session.game);
    if (at === undefined)
      return {
        ok: false,
        reason: "No starting settlement location available.",
      };
    return applyOnlineCommand(
      session,
      session.game.turn,
      session.revision,
      { type: "build", building: "settlement", at },
      now,
      rollDice,
    );
  }
  let current = session;
  let dice: [number, number] | undefined;
  if (current.game.phase === "roll") {
    const rolled = applyOnlineCommand(
      current,
      current.game.turn,
      current.revision,
      { type: "roll" },
      now,
      rollDice,
    );
    if (!rolled.ok) return rolled;
    current = rolled.session;
    dice = rolled.dice;
  }
  const ended = applyOnlineCommand(
    current,
    current.game.turn,
    current.revision,
    { type: "endTurn" },
    now,
    rollDice,
  );
  return ended.ok && dice ? { ...ended, dice } : ended;
}
