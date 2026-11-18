import type { Resource } from "./board";

export type Goods = Exclude<Resource, "desert">;
export const goods: Goods[] = ["wood", "brick", "wheat", "ore", "sheep"];
export type Hand = Record<Goods, number>;
export const emptyHand = (): Hand => ({
  wood: 0,
  brick: 0,
  wheat: 0,
  ore: 0,
  sheep: 0,
});
