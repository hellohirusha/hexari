import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ForgeAccount from "../src/forge/ForgeAccount";
import { refreshAfterSignupConfirmation } from "../src/forge/account";

const harness = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void>,
  client: null as unknown,
}));

vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.values))
        harness.values[index] =
          typeof initial === "function" ? initial() : initial;
      return [
        harness.values[index],
        (next: unknown) => {
          harness.values[index] =
            typeof next === "function" ? next(harness.values[index]) : next;
        },
      ];
    },
    useEffect: (effect: () => void) => harness.effects.push(effect),
  };
});
vi.mock("../src/forge/account", async (load) => {
  const actual = await load<typeof import("../src/forge/account")>();
  return {
    ...actual,
    loadAccountClient: () => Promise.resolve(harness.client),
  };
});

function find(
  node: ReactNode,
  predicate: (value: {
    type: unknown;
    props: Record<string, unknown>;
  }) => boolean,
): { type: unknown; props: Record<string, unknown> } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = find(child, predicate);
      if (match) return match;
    }
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (predicate(element)) return element;
  return find(node.props.children, predicate);
}

beforeEach(() => {
  harness.values = [];
  harness.cursor = 0;
  harness.effects = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("records a signup and refreshes the welcome tab after a matching confirmation event", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  const reload = vi.fn();
  vi.stubGlobal("window", {
    location: {
      href: "https://forge.example/",
      origin: "https://forge.example",
      pathname: "/",
      search: "",
      reload,
    },
    sessionStorage: storage,
    setTimeout,
  });
  const signUp = vi.fn(async () => ({ error: null, data: { session: null } }));
  let accountListener: (event: string, session: unknown) => void = () => {};
  harness.client = {
    auth: {
      onAuthStateChange: (listener: typeof accountListener) => {
        accountListener = listener;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: async () => ({ error: null, data: { session: null } }),
      signUp,
    },
  };
  const render = () => {
    harness.cursor = 0;
    return ForgeAccount({ canReloadAfterConfirmation: () => true });
  };
  render();
  harness.effects[0]();
  for (let i = 0; i < 4; i++) await Promise.resolve();
  let tree = render();
  const register = find(
    tree,
    (element) =>
      element.type === "button" && element.props.children === "Create account",
  );
  (register!.props.onClick as () => void)();
  const fill = (label: string, value: string) => {
    tree = render();
    const container = find(
      tree,
      (element) =>
        element.type === "label" &&
        Array.isArray(element.props.children) &&
        element.props.children[0] === label,
    );
    const input = find(
      container!.props.children as ReactNode,
      (element) => element.type === "input",
    );
    (input!.props.onChange as (event: unknown) => void)({ target: { value } });
  };
  fill("Player name", "Player One");
  fill("Email", "player@example.com");
  fill("Password", "safe-password");
  tree = render();
  const form = find(tree, (element) => element.type === "form");
  await (form!.props.onSubmit as (event: unknown) => Promise<void>)({
    preventDefault: () => {},
  });
  expect(signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "player@example.com",
      options: expect.objectContaining({
        emailRedirectTo: "https://forge.example/?account=confirm",
      }),
    }),
  );
  expect([...values.values()]).toEqual(["player@example.com"]);
  const session = {
    user: {
      email: "player@example.com",
      email_confirmed_at: "2026-01-01",
      user_metadata: {},
    },
  };
  accountListener("SIGNED_IN", session);
  refreshAfterSignupConfirmation("SIGNED_IN", session, () => true);
  vi.runAllTimers();
  expect(reload).toHaveBeenCalledTimes(1);
});
