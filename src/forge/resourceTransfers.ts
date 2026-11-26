import { costs, goods, type Building, type Goods } from "./engine";

export type ResourceTransfer = {
  resource: Goods;
  amount: number;
  from: 0 | 1 | "bank";
  to: 0 | 1 | "bank";
};

/** Translate accepted public game actions into visible card movements. */
export function transfersForAction(value: unknown): ResourceTransfer[] {
  if (!value || typeof value !== "object") return [];
  const action = value as Record<string, unknown>;
  const actor = action.actor;
  if (actor !== 0 && actor !== 1) return [];
  if (action.type === "build") {
    if (action.setup === true) return [];
    if (!["road", "settlement", "city"].includes(String(action.building)))
      return [];
    return goods.flatMap((resource) => {
      const amount = costs[action.building as Building][resource] ?? 0;
      return amount
        ? [{ resource, amount, from: actor, to: "bank" as const }]
        : [];
    });
  }
  if (
    !goods.includes(action.give as Goods) ||
    !goods.includes(action.receive as Goods) ||
    action.give === action.receive
  )
    return [];
  const give = action.give as Goods,
    receive = action.receive as Goods;
  if (action.type === "bank")
    return [
      { resource: give, amount: 4, from: actor, to: "bank" },
      { resource: receive, amount: 1, from: "bank", to: actor },
    ];
  if (action.type === "trade" && action.other === 1 - actor)
    return [
      { resource: give, amount: 1, from: actor, to: action.other as 0 | 1 },
      { resource: receive, amount: 1, from: action.other as 0 | 1, to: actor },
    ];
  return [];
}
