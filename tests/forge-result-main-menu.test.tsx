import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { newGame } from "../src/forge/engine";
import ForgeResult from "../src/forge/ForgeResult";

vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useEffect: () => {},
    useRef: () => ({ current: null }),
  };
});

function findButton(node: ReactNode, label: string): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const action = findButton(child, label);
      if (action) return action;
    }
    return;
  }
  if (
    !isValidElement<{
      children?: ReactNode;
      onClick?: () => void;
      label?: string;
    }>(node)
  )
    return;
  if (node.props.label === label) return node.props.onClick;
  return findButton(node.props.children, label);
}

describe("Forge result main menu", () => {
  it.each([
    { bot: true, winner: 0 },
    { bot: true, winner: 1 },
    { bot: false, winner: 1 },
  ])("invokes the menu action for a completed game", ({ bot, winner }) => {
    const game = newGame(0);
    game.phase = "end";
    game.winner = winner;
    const onMainMenu = vi.fn();
    const onPlayAgain = vi.fn();
    const onViewBoard = vi.fn();
    const result = ForgeResult({
      game,
      bot,
      onMainMenu,
      onPlayAgain,
      onViewBoard,
    });

    const mainMenu = findButton(result, "Main menu");
    expect(mainMenu).toBeDefined();
    mainMenu?.();
    expect(onMainMenu).toHaveBeenCalledOnce();
    expect(onPlayAgain).not.toHaveBeenCalled();
    expect(onViewBoard).not.toHaveBeenCalled();
  });
});
