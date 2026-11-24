import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeActivity, {
  onlineChatPlayerName,
} from "../src/forge/ForgeActivity";
import ForgeOnlineTrade from "../src/forge/ForgeOnlineTrade";
import ForgeOnlineLobby, {
  canSearchAfterClosed,
} from "../src/forge/ForgeOnlineLobby";
import { newGame, transition } from "../src/forge/engine";
import { deliverChat } from "../src/forge/chatSend";

const roll = () => transition(newGame(0), { type: "roll", total: 7 });
const offer = {
  by: 0 as const,
  give: "wood" as const,
  receive: "ore" as const,
};
const noop = () => {};

describe("Forge online lobby", () => {
  it("blocks a localhost server configured on the production page", () => {
    vi.stubEnv("VITE_FORGE_SERVER_URL", "ws://localhost:8787/forge");
    vi.stubGlobal("window", {
      location: {
        hash: "",
        hostname: "forge.example",
        origin: "https://forge.example",
      },
    });
    vi.stubGlobal("sessionStorage", { getItem: () => null });
    try {
      const html = renderToStaticMarkup(
        <ForgeOnlineLobby onClose={noop} onReady={noop} onAccount={noop} />,
      );
      expect(html).toContain(
        "The online server address is not allowed from this page.",
      );
      expect(html).not.toContain("Finding a player...");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
  it("starts a new search only when the previous match was left or has expired", () => {
    expect(
      canSearchAfterClosed(
        true,
        "opponent_left",
        "The other player left the game.",
      ),
    ).toBe(true);
    expect(
      canSearchAfterClosed(
        true,
        undefined,
        "The saved online game is no longer available.",
      ),
    ).toBe(true);
    expect(
      canSearchAfterClosed(true, undefined, "Game storage is unavailable."),
    ).toBe(false);
    expect(
      canSearchAfterClosed(
        false,
        "opponent_left",
        "The other player left the game.",
      ),
    ).toBe(false);
  });
  it("offers resume and a new game when this tab has saved credentials", () => {
    vi.stubGlobal("window", {
      location: {
        hash: "",
        hostname: "localhost",
        origin: "http://localhost:5173",
      },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: () => JSON.stringify({ room: "room", token: "token" }),
    });
    try {
      const html = renderToStaticMarkup(
        <ForgeOnlineLobby onClose={noop} onReady={noop} onAccount={noop} />,
      );
      expect(html).toContain("Resume game");
      expect(html).toContain("Start new game");
      expect(html).not.toContain("Finding a player...");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("starts leaving the saved game when finding a new game after a disconnect", () => {
    vi.stubGlobal("window", {
      location: {
        hash: "",
        hostname: "localhost",
        origin: "http://localhost:5173",
      },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: () => JSON.stringify({ room: "room", token: "token" }),
    });
    try {
      const html = renderToStaticMarkup(
        <ForgeOnlineLobby
          onClose={noop}
          onReady={noop}
          onAccount={noop}
          startNew
        />,
      );
      expect(html).toContain("Connecting to your previous game...");
      expect(html).not.toContain("Resume game");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("allows leaving the previous game to accept an invitation", () => {
    vi.stubGlobal("window", {
      location: {
        hash: "#forge-room=invite&from=AmberFox%231234",
        hostname: "localhost",
        origin: "http://localhost:5173",
      },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: () => JSON.stringify({ room: "previous", token: "token" }),
    });
    try {
      const html = renderToStaticMarkup(
        <ForgeOnlineLobby onClose={noop} onReady={noop} onAccount={noop} />,
      );
      expect(html).toContain("Resume game");
      expect(html).toContain("Leave current game and join invite");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Forge online trade interface", () => {
  it("does not show trade controls before a roll", () => {
    expect(
      renderToStaticMarkup(
        <ForgeOnlineTrade
          game={newGame(0)}
          seat={0}
          offer={null}
          disabled={false}
          onCommand={noop}
        />,
      ),
    ).toBe("");
  });

  it("uses accessible cards without dropdowns for a new offer", () => {
    const html = renderToStaticMarkup(
      <ForgeOnlineTrade
        game={roll()}
        seat={0}
        offer={null}
        disabled={false}
        onCommand={noop}
      />,
    );
    expect(html).toContain('aria-label="Give wood"');
    expect(html).toContain('aria-label="Receive ore"');
    expect(html).toContain('aria-label="Offer trade"');
    expect(html).not.toContain("<select");
  });

  it("describes an incoming offer from the receiving player's perspective", () => {
    const game = roll();
    const html = renderToStaticMarkup(
      <ForgeOnlineTrade
        game={game}
        seat={1}
        offer={offer}
        disabled={false}
        onCommand={noop}
      />,
    );
    expect(html).toContain(
      'role="group" aria-label="Give ore and receive wood"',
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toMatch(/<button[^>]*>Accept<\/button>/);
    expect(html).toMatch(/<button[^>]*>Decline<\/button>/);
    game.players[1].hand.ore = 0;
    const unavailable = renderToStaticMarkup(
      <ForgeOnlineTrade
        game={game}
        seat={1}
        offer={offer}
        disabled={false}
        onCommand={noop}
      />,
    );
    expect(unavailable).toMatch(/<button[^>]*disabled[^>]*>Accept<\/button>/);
    expect(unavailable).toMatch(/<button[^>]*>Decline<\/button>/);
  });

  it("keeps the offer visible to the player who sent it", () => {
    const html = renderToStaticMarkup(
      <ForgeOnlineTrade
        game={roll()}
        seat={0}
        offer={offer}
        disabled={false}
        onCommand={noop}
      />,
    );
    expect(html).toContain("Waiting for the other player");
    expect(html).toContain('aria-label="Give wood and receive ore"');
    expect(html).not.toContain(">Accept</button>");
  });
});

describe("Forge chat interface", () => {
  it("names each player's own messages You and the other player by seat", () => {
    expect(onlineChatPlayerName(0, 0)).toBe("You");
    expect(onlineChatPlayerName(1, 1)).toBe("You");
    expect(onlineChatPlayerName(1, 0)).toBe("Player 2");
    expect(onlineChatPlayerName(0, 1)).toBe("Player 1");
    expect(
      onlineChatPlayerName(0, 0, ["AmberFox#1234", "SilverWolf#5678"]),
    ).toBe("You");
    expect(
      onlineChatPlayerName(1, 0, ["AmberFox#1234", "SilverWolf#5678"]),
    ).toBe("SilverWolf#5678");
  });
  it("does not render chat in local play", () => {
    const html = renderToStaticMarkup(
      <ForgeActivity
        activity={[]}
        chat={[]}
        setChat={noop}
        bot
        player={1}
        onMessage={noop}
      />,
    );
    expect(html).not.toContain("Table chat");
  });

  it("renders a retractable chat with accessible reports and escapes message text", () => {
    const html = renderToStaticMarkup(
      <ForgeActivity
        activity={[]}
        chat={[
          {
            id: "message-1",
            player: "Player 2",
            text: "<test>",
            flagged: false,
          },
        ]}
        setChat={noop}
        bot={false}
        player={1}
        onMessage={noop}
        showChat
        onSendChat={async () => true}
        onReportChat={noop}
      />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="forge-chat-body"');
    expect(html).toContain('aria-label="Report message 1 from Player 2"');
    expect(html).toContain("&lt;test&gt;");
    expect(html).not.toContain("<test>");
  });

  it("disables sending and reporting while the connection is unavailable", () => {
    const html = renderToStaticMarkup(
      <ForgeActivity
        activity={[]}
        chat={[{ id: "message-1", player: "Player 2", text: "Hello" }]}
        setChat={noop}
        bot={false}
        player={1}
        onMessage={noop}
        showChat
        onSendChat={async () => true}
        onReportChat={noop}
        chatConnected={false}
      />,
    );
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Send message"/);
    expect(html).toMatch(
      /<button[^>]*aria-label="Report message 1 from Player 2"[^>]*disabled/,
    );
  });
  it("reports acknowledged sends and preserves failures without retrying or throwing", async () => {
    let calls = 0;
    expect(
      await deliverChat(async (message) => {
        calls++;
        expect(message).toBe("hello");
        return true;
      }, "hello"),
    ).toBe(true);
    expect(await deliverChat(async () => false, "draft")).toBe(false);
    expect(
      await deliverChat(() => Promise.reject(new Error("rejected")), "draft"),
    ).toBe(false);
    expect(
      await deliverChat(() => {
        throw new Error("socket closed");
      }, "draft"),
    ).toBe(false);
    expect(calls).toBe(1);
  });
});
