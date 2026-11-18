import { goods, type Goods, type Hand } from "../../shared/resources";

export type Hypothesis = { hands: Hand[]; probability: number };
export function initialBelief(hands: Hand[]): Hypothesis[] {
  if (
    hands.length < 2 ||
    hands.some((hand) =>
      goods.some(
        (resource) =>
          !Number.isSafeInteger(hand[resource]) || hand[resource] < 0,
      ),
    )
  )
    return [];
  return [{ hands: hands.map((hand) => ({ ...hand })), probability: 1 }];
}
/** Given a uniformly random card stolen from a victim, branch each possible world. */
export function unknownSteal(
  prior: Hypothesis[],
  thief: number,
  victim: number,
): Hypothesis[] | null {
  if (
    thief === victim ||
    !Number.isInteger(thief) ||
    !Number.isInteger(victim) ||
    thief < 0 ||
    victim < 0 ||
    prior.some((world) => !world.hands[thief] || !world.hands[victim])
  )
    return null;
  const combined = new Map<string, Hypothesis>();
  for (const world of prior) {
    const total = goods.reduce(
      (sum, resource) => sum + world.hands[victim][resource],
      0,
    );
    if (total === 0) continue;
    for (const resource of goods) {
      const count = world.hands[victim][resource];
      if (!count) continue;
      const hands = world.hands.map((hand) => ({ ...hand }));
      hands[victim][resource]--;
      hands[thief][resource]++;
      const key = JSON.stringify(hands);
      const probability = (world.probability * count) / total;
      const old = combined.get(key);
      if (old) old.probability += probability;
      else combined.set(key, { hands, probability });
      if (combined.size > 10000) return null;
    }
  }
  const worlds = [...combined.values()];
  const total = worlds.reduce((sum, world) => sum + world.probability, 0);
  return total > 0
    ? worlds.map((world) => ({
        ...world,
        probability: world.probability / total,
      }))
    : null;
}
/** Condition on an observation that a player holds at least one card of a resource. */
export function observeResource(
  prior: Hypothesis[],
  player: number,
  resource: Goods,
): Hypothesis[] | null {
  const possible = prior.filter(
    (world) => (world.hands[player]?.[resource] ?? 0) > 0,
  );
  const total = possible.reduce((sum, world) => sum + world.probability, 0);
  return total
    ? possible.map((world) => ({
        ...world,
        probability: world.probability / total,
      }))
    : null;
}
/** Apply a known gain or spend, conditioning away worlds that cannot pay. */
export function applyKnownChange(
  prior: Hypothesis[],
  player: number,
  resource: Goods,
  delta: number,
): Hypothesis[] | null {
  if (
    !Number.isInteger(delta) ||
    delta === 0 ||
    !Number.isInteger(player) ||
    player < 0
  )
    return null;
  const possible = prior.filter(
    (world) =>
      world.hands[player] && world.hands[player][resource] + delta >= 0,
  );
  const total = possible.reduce((sum, world) => sum + world.probability, 0);
  if (!total) return null;
  return possible.map((world) => {
    const hands = world.hands.map((hand) => ({ ...hand }));
    hands[player][resource] += delta;
    return { hands, probability: world.probability / total };
  });
}
export function beliefSummary(
  worlds: Hypothesis[],
  player: number,
  resource: Goods,
) {
  const distribution = new Map<number, number>();
  for (const world of worlds) {
    const count = world.hands[player]?.[resource] ?? 0;
    distribution.set(count, (distribution.get(count) ?? 0) + world.probability);
  }
  return [...distribution]
    .sort(([a], [b]) => a - b)
    .map(([count, probability]) => ({ count, probability }));
}
