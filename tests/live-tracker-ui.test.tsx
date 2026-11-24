import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBoard, ports } from "../src/shared/board";
import { emptyHand } from "../src/shared/resources";
import { startSession } from "../src/hexari/engine/liveTracker";
import LiveTracker from "../src/hexari/LiveTracker";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useEffect: () => {},
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values))
        hooks.values[index] =
          typeof initial === "function" ? initial() : initial;
      return [
        hooks.values[index],
        (next: unknown) => {
          hooks.values[index] =
            typeof next === "function" ? next(hooks.values[index]) : next;
        },
      ];
    },
  };
});

function findChoice(
  node: ReactNode,
  label: string,
):
  | { value: number; onChange: (value: string) => void; children: ReactNode }
  | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findChoice(child, label);
      if (match) return match;
    }
  }
  if (!isValidElement<{ "aria-label"?: string; children?: ReactNode }>(node))
    return;
  if (node.props["aria-label"] === label)
    return node.props as {
      value: number;
      onChange: (value: string) => void;
      children: ReactNode;
    };
  return findChoice(node.props.children, label);
}

describe("live tracker player selection", () => {
  beforeEach(() => {
    hooks.values = [];
    hooks.cursor = 0;
    const session = startSession(
      [
        { name: "Player 1", corners: "", hand: emptyHand() },
        { name: "Player 2", corners: "", hand: emptyHand() },
      ],
      defaultBoard,
      ports,
    )!;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "hexari-live-session-v2" ? JSON.stringify(session) : null,
    });
  });

  it("keeps the other player distinct after choosing who to correct", () => {
    const render = () => {
      hooks.cursor = 0;
      return LiveTracker({
        board: defaultBoard,
        boardPorts: ports,
        onUsePosition: () => {},
      });
    };
    let screen = render();
    findChoice(screen, "Player to correct")!.onChange("1");
    screen = render();
    expect(findChoice(screen, "Player")!.value).toBe(1);
    expect(findChoice(screen, "Other player")!.value).not.toBe(1);
  });
});
