export type Resource = "wood" | "brick" | "wheat" | "ore" | "sheep" | "desert";
export type Tile = { resource: Resource; number: number | null };
export type Vertex = {
  id: number;
  x: number;
  y: number;
  tiles: number[];
  neighbors: number[];
};
export const pips: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};
export const resources: Resource[] = [
  "wood",
  "brick",
  "wheat",
  "ore",
  "sheep",
  "desert",
];
const terrains: Resource[] = [
  "wood",
  "sheep",
  "wheat",
  "brick",
  "ore",
  "wood",
  "wheat",
  "sheep",
  "brick",
  "desert",
  "ore",
  "wood",
  "sheep",
  "wheat",
  "brick",
  "ore",
  "wood",
  "sheep",
  "wheat",
];
const numbers = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];
let n = 0;
export const defaultBoard: Tile[] = terrains.map((resource) => ({
  resource,
  number: resource === "desert" ? null : numbers[n++],
}));
export const hexes = Array.from({ length: 5 }, (_, row) => {
  const r = row - 2;
  const min = Math.max(-2, -r - 2),
    max = Math.min(2, -r + 2);
  return Array.from({ length: max - min + 1 }, (_, i) => ({ q: min + i, r }));
}).flat();
export const centers = hexes.map(({ q, r }) => ({
  x: Math.sqrt(3) * (q + r / 2),
  y: 1.5 * r,
}));
function makeVertices(): Vertex[] {
  const vertices: Vertex[] = [];
  centers.forEach((center, tile) => {
    const corners: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = ((60 * i - 30) * Math.PI) / 180;
      const x = center.x + Math.cos(angle),
        y = center.y + Math.sin(angle);
      let vertex = vertices.find(
        (v) => Math.abs(v.x - x) < 0.001 && Math.abs(v.y - y) < 0.001,
      );
      if (!vertex) {
        vertex = { id: vertices.length, x, y, tiles: [], neighbors: [] };
        vertices.push(vertex);
      }
      vertex.tiles.push(tile);
      corners.push(vertex.id);
    }
    corners.forEach((id, i) => {
      const v = vertices[id],
        next = corners[(i + 1) % 6];
      if (!v.neighbors.includes(next)) v.neighbors.push(next);
      if (!vertices[next].neighbors.includes(id))
        vertices[next].neighbors.push(id);
    });
  });
  return vertices;
}
export const vertices = makeVertices();
export function swapTiles(board: Tile[], from: number, to: number): Tile[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= board.length ||
    to >= board.length ||
    from === to
  )
    return board;
  const result = board.slice();
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}
export function swapNumbers(board: Tile[], from: number, to: number): Tile[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= board.length ||
    to >= board.length ||
    from === to ||
    board[from].number === null ||
    board[to].number === null ||
    board[from].resource === "desert" ||
    board[to].resource === "desert"
  )
    return board;
  const result = board.slice();
  result[from] = { ...board[from], number: board[to].number };
  result[to] = { ...board[to], number: board[from].number };
  return result;
}
export type PaletteSelection =
  { kind: "terrain"; resource: Resource } | { kind: "number"; number: number };
export function placePalette(
  board: Tile[],
  index: number,
  selection: PaletteSelection,
): Tile[] {
  if (!Number.isInteger(index) || index < 0 || index >= board.length)
    return board;
  const tile = board[index];
  if (
    selection.kind === "number" &&
    (tile.resource === "desert" || !Object.hasOwn(pips, selection.number))
  )
    return board;
  const updated =
    selection.kind === "terrain"
      ? {
          resource: selection.resource,
          number: selection.resource === "desert" ? null : (tile.number ?? 6),
        }
      : { ...tile, number: selection.number };
  return board.map((entry, position) => (position === index ? updated : entry));
}
export type Strategy = "balanced" | "ore" | "road" | "port";
export type Port = {
  vertex: number;
  otherVertex?: number;
  resource: Exclude<Resource, "desert"> | "any";
  rate: 2 | 3;
};
const coast = vertices
  .filter((v) => v.tiles.length < 3)
  .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
const defaultPortTypes: Port["resource"][] = [
  "any",
  "wood",
  "any",
  "brick",
  "any",
  "sheep",
  "any",
  "ore",
  "wheat",
];
const usedPortCorners = new Set<number>();
export const ports: Port[] = defaultPortTypes.map((resource, i) => {
  const start = Math.floor((i * coast.length) / defaultPortTypes.length);
  for (let offset = 0; offset < coast.length; offset++) {
    const corner = coast[(start + offset) % coast.length];
    if (usedPortCorners.has(corner.id)) continue;
    const other = corner.neighbors.find(
      (id) =>
        !usedPortCorners.has(id) &&
        vertices[id].tiles.length < 3 &&
        corner.tiles.filter((tile) => vertices[id].tiles.includes(tile))
          .length === 1,
    );
    if (other === undefined) continue;
    usedPortCorners.add(corner.id);
    usedPortCorners.add(other);
    return {
      vertex: corner.id,
      otherVertex: other,
      resource,
      rate: resource === "any" ? 3 : 2,
    };
  }
  throw new Error(
    "Could not place the default ports on distinct coastal edges.",
  );
});
export function validateBoard(board: Tile[]): string[] {
  const errors: string[] = [];
  if (board.length !== 19) return ["A standard board needs 19 tiles."];
  const expected: Record<Resource, number> = {
    wood: 4,
    brick: 3,
    wheat: 4,
    ore: 3,
    sheep: 4,
    desert: 1,
  };
  for (const resource of resources)
    if (
      board.filter((t) => t.resource === resource).length !== expected[resource]
    )
      errors.push(`Expected ${expected[resource]} ${resource} tiles.`);
  const tokens: Record<number, number> = {
    2: 1,
    3: 2,
    4: 2,
    5: 2,
    6: 2,
    8: 2,
    9: 2,
    10: 2,
    11: 2,
    12: 1,
  };
  for (const [number, count] of Object.entries(tokens))
    if (board.filter((t) => t.number === Number(number)).length !== count)
      errors.push(`Expected ${count} number ${number} tokens.`);
  if (board.some((t) => (t.resource === "desert") !== (t.number === null)))
    errors.push("Only the desert may have no number.");
  return errors;
}
export function scoreVertex(
  board: Tile[],
  vertex: Vertex,
  strategy: Strategy = "balanced",
  first?: Vertex,
  boardPorts: Port[] = ports,
) {
  const tiles = vertex.tiles.map((i) => board[i]).filter(Boolean);
  const production = tiles.reduce(
    (sum, t) => sum + (t.number ? (pips[t.number] ?? 0) : 0),
    0,
  );
  const unique = new Set(
    tiles.filter((t) => t.resource !== "desert").map((t) => t.resource),
  ).size;
  const previous = new Set(first?.tiles.map((i) => board[i].resource) ?? []);
  const complement = first
    ? new Set(
        tiles
          .filter((t) => t.resource !== "desert" && !previous.has(t.resource))
          .map((t) => t.resource),
      ).size
    : 0;
  const focus = tiles.reduce(
    (sum, t) =>
      sum +
      (t.number ? (pips[t.number] ?? 0) : 0) *
        ((strategy === "ore" && ["ore", "wheat"].includes(t.resource)) ||
        (strategy === "road" && ["wood", "brick"].includes(t.resource))
          ? 0.4
          : 0),
    0,
  );
  const boardPips = new Map<Resource, number>();
  for (const t of board)
    boardPips.set(
      t.resource,
      (boardPips.get(t.resource) ?? 0) + (t.number ? (pips[t.number] ?? 0) : 0),
    );
  const scarcity = tiles.reduce(
    (sum, t) =>
      sum +
      (t.resource === "desert" || !t.number
        ? 0
        : ((pips[t.number] ?? 0) * 6) /
          Math.max(1, boardPips.get(t.resource) ?? 1)),
    0,
  );
  const port = boardPorts.find(
    (p) => p.vertex === vertex.id || p.otherVertex === vertex.id,
  );
  // A specialized port retains some future option value, but is more useful
  // when the opening settlements can already supply the resource it trades.
  const portSupply =
    port && port.resource !== "any"
      ? [
          ...tiles,
          ...(first?.tiles.map((i) => board[i]).filter(Boolean) ?? []),
        ].reduce(
          (sum, tile) =>
            sum +
            (tile.resource === port.resource && tile.number
              ? (pips[tile.number] ?? 0)
              : 0),
          0,
        )
      : 0;
  const portBonus = port
    ? (port.resource === "any"
        ? 1.5
        : 1.25 + 1.25 * Math.min(portSupply / 5, 1)) *
      (strategy === "port" ? 2 : 1)
    : 0;
  return {
    production,
    expectedPerRoll: production / 36,
    unique,
    diversityBonus: unique * 1.5,
    complement,
    focus,
    scarcity,
    port: port?.resource ?? null,
    portRate: port?.rate ?? null,
    portBonus,
    score:
      production + unique * 1.5 + complement + focus + scarcity + portBonus,
  };
}
export function encodeBoard(board: Tile[]) {
  return btoa(JSON.stringify(board));
}
export type BoardConfig = { board: Tile[]; ports: Port[] };

// The compact format stores each tile in one byte and each port in two bytes.
// The prefix keeps new links distinct from the original Base64 JSON links.
const compactPrefix = "h2.";
const compactNumbers: readonly (number | null)[] = [
  null,
  2,
  3,
  4,
  5,
  6,
  8,
  9,
  10,
  11,
  12,
];
const compactPortResources: Port["resource"][] = [
  "any",
  "wood",
  "brick",
  "wheat",
  "ore",
  "sheep",
];
export function encodeBoardConfig(config: BoardConfig) {
  const tiles = config.board.map((tile) => {
    const resource = resources.indexOf(tile.resource);
    const number = compactNumbers.indexOf(tile.number);
    return resource < 0 || number < 0 ? -1 : (resource << 4) | number;
  });
  const encodedPorts = config.ports.map((port) => {
    const resource = compactPortResources.indexOf(port.resource);
    const other = port.otherVertex ?? 63;
    if (
      resource < 0 ||
      !Number.isInteger(port.vertex) ||
      port.vertex < 0 ||
      port.vertex >= vertices.length ||
      !Number.isInteger(other) ||
      (other !== 63 && (other < 0 || other >= vertices.length)) ||
      port.rate !== (port.resource === "any" ? 3 : 2)
    )
      return -1;
    return (port.vertex << 9) | (other << 3) | resource;
  });
  if (
    tiles.length !== 19 ||
    tiles.includes(-1) ||
    encodedPorts.length > vertices.length ||
    encodedPorts.includes(-1)
  )
    return btoa(JSON.stringify({ version: 1, ...config }));
  const bytes = [
    2,
    ...tiles,
    encodedPorts.length,
    ...encodedPorts.flatMap((port) => [port >> 8, port & 255]),
  ];
  const value = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return compactPrefix + value;
}
export function decodeBoardConfig(value: string): BoardConfig | null {
  try {
    if (value.startsWith(compactPrefix)) {
      const encoded = value.slice(compactPrefix.length);
      if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 172)
        return null;
      const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Array.from(binary, (char) => char.charCodeAt(0));
      if (bytes.length < 21 || bytes[0] !== 2 || bytes[20] > vertices.length)
        return null;
      if (bytes.length !== 21 + bytes[20] * 2) return null;
      const board: Tile[] = [];
      for (const tile of bytes.slice(1, 20)) {
        const resource = resources[tile >> 4];
        const number = compactNumbers[tile & 15];
        if (resource === undefined || number === undefined) return null;
        board.push({ resource, number });
      }
      const compactPorts: Port[] = [];
      for (let index = 21; index < bytes.length; index += 2) {
        const entry = (bytes[index] << 8) | bytes[index + 1];
        const vertex = entry >> 9;
        const other = (entry >> 3) & 63;
        const resource = compactPortResources[entry & 7];
        if (!resource) return null;
        compactPorts.push({
          vertex,
          ...(other === 63 ? {} : { otherVertex: other }),
          resource,
          rate: resource === "any" ? 3 : 2,
        });
      }
      // Reuse the legacy validator for coastal edges, duplicate ports and tiles.
      return decodeBoardConfig(
        btoa(JSON.stringify({ version: 1, board, ports: compactPorts })),
      );
    }
    const parsed: unknown = JSON.parse(atob(value));
    if (Array.isArray(parsed)) {
      const board = decodeBoard(value);
      return board ? { board, ports: ports.map((p) => ({ ...p })) } : null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const config = parsed as {
      version?: unknown;
      board?: unknown;
      ports?: unknown;
    };
    if (
      config.version !== 1 ||
      !Array.isArray(config.board) ||
      !Array.isArray(config.ports)
    )
      return null;
    const board = decodeBoard(btoa(JSON.stringify(config.board)));
    if (!board) return null;
    const seen = new Set<number>();
    const valid = config.ports.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const p = item as Port;
      if (
        !Number.isInteger(p.vertex) ||
        !vertices[p.vertex] ||
        vertices[p.vertex].tiles.length >= 3 ||
        seen.has(p.vertex) ||
        !["any", "wood", "brick", "wheat", "ore", "sheep"].includes(
          p.resource,
        ) ||
        p.rate !== (p.resource === "any" ? 3 : 2)
      )
        return false;
      if (p.otherVertex !== undefined) {
        const other = vertices[p.otherVertex];
        if (
          !Number.isInteger(p.otherVertex) ||
          !other ||
          other.tiles.length >= 3 ||
          seen.has(p.otherVertex) ||
          !vertices[p.vertex].neighbors.includes(p.otherVertex) ||
          vertices[p.vertex].tiles.filter((t) => other.tiles.includes(t))
            .length !== 1
        )
          return false;
        seen.add(p.otherVertex);
      }
      seen.add(p.vertex);
      return true;
    });
    return valid ? { board, ports: config.ports as Port[] } : null;
  } catch {
    return null;
  }
}
export function decodeBoard(value: string): Tile[] | null {
  try {
    if (value.startsWith(compactPrefix))
      return decodeBoardConfig(value)?.board ?? null;
    const x: unknown = JSON.parse(atob(value));
    if (x && !Array.isArray(x) && typeof x === "object")
      return decodeBoardConfig(value)?.board ?? null;
    if (
      !Array.isArray(x) ||
      x.length !== 19 ||
      !x.every(
        (t) =>
          t &&
          resources.includes(t.resource) &&
          (t.number === null ||
            (typeof t.number === "number" && Object.hasOwn(pips, t.number))),
      )
    )
      return null;
    return x as Tile[];
  } catch {
    return null;
  }
}
