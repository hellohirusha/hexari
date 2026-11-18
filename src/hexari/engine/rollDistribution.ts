import { pips } from "../../shared/board";

/** Exact binomial tails: describe the history, never the probability of the next roll. */
export function rollDeviation(
  rolls: readonly number[],
  total: number,
): "low" | "high" | null {
  const n = rolls.length;
  const ways = total === 7 ? 6 : pips[total];
  if (!n || !ways) return null;
  const count = rolls.filter((roll) => roll === total).length;
  const probability = ways / 36;
  const mode = Math.floor((n + 1) * probability);
  const weights = Array<number>(n + 1).fill(0);
  weights[mode] = 1;
  for (let k = mode; k > 0; k--)
    weights[k - 1] =
      (weights[k] * k * (1 - probability)) / ((n - k + 1) * probability);
  for (let k = mode; k < n; k++)
    weights[k + 1] =
      (weights[k] * (n - k) * probability) / ((k + 1) * (1 - probability));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const lower =
    weights.slice(0, count + 1).reduce((sum, value) => sum + value, 0) /
    totalWeight;
  const upper =
    weights.slice(count).reduce((sum, value) => sum + value, 0) / totalWeight;
  if (count < n * probability && lower <= 0.025) return "low";
  if (count > n * probability && upper <= 0.025) return "high";
  return null;
}
