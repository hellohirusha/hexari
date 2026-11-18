import { pips } from "../shared/board";
import { defaultBoard, vertices } from "./board";
import { playAutomatedTurn } from "./bot";
import { newGame, type Game } from "./engine";

/** Production at each fixed starting location, before any game actions. */
export function startingProduction() {
  return newGame(0).players.map((player) => {
    const corner = player.settlements[0];
    const tiles = vertices[corner].tiles.map((id) => defaultBoard[id]);
    const rolls = tiles.reduce(
      (sum, tile) => sum + (pips[tile.number ?? 0] ?? 0),
      0,
    );
    return {
      corner,
      pips: rolls,
      expectedCardsPerRoll: rolls / 36,
      resources: tiles.map((tile) => tile.resource),
    };
  });
}

/** Reproducible bot-versus-bot games. Turns are not a measurement of elapsed human playtime. */
export function studyGame(
  seed: number,
  maxTurns = 1000,
  swapStarts = false,
  corners?: [number, number],
): { game: Game; turns: number } {
  let state = Math.trunc(seed) >>> 0 || 1;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  let game = newGame(0),
    turns = 0;
  if (corners) {
    game.players[0].settlements = [corners[0]];
    game.players[1].settlements = [corners[1]];
  }
  if (swapStarts) game.players = [game.players[1], game.players[0]];
  while (game.phase !== "end" && turns < maxTurns) {
    const first = Math.floor(random() * 6) + 1;
    const second = Math.floor(random() * 6) + 1;
    game = playAutomatedTurn(game, first + second, ++turns * 1000).game;
  }
  return { game, turns };
}
