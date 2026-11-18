import {
  centers as standardCenters,
  defaultBoard as standardBoard,
  vertices as standardVertices,
  type Tile,
  type Vertex,
} from "../shared/board";

// Keep the original six outer tiles first, preserving saved corner IDs.
const existingOuterHexes = [
  [-3, 0],
  [3, 0],
  [0, -3],
  [3, -3],
  [0, 3],
  [-3, 3],
];
const remainingOuterHexes = Array.from({ length: 7 }, (_, row) => {
  const r = row - 3;
  const min = Math.max(-3, -r - 3);
  const max = Math.min(3, -r + 3);
  return Array.from({ length: max - min + 1 }, (_, i) => [min + i, r]);
})
  .flat()
  .filter(
    ([q, r]) =>
      Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 3 &&
      !existingOuterHexes.some(([a, b]) => a === q && b === r),
  );
const extraHexes = [...existingOuterHexes, ...remainingOuterHexes];
export const centers = [
  ...standardCenters,
  ...extraHexes.map(([q, r]) => ({
    x: Math.sqrt(3) * (q + r / 2),
    y: 1.5 * r,
  })),
];
export const defaultBoard: Tile[] = [
  ...standardBoard,
  ...([
    { resource: "wood", number: 4 },
    { resource: "wood", number: 4 },
    { resource: "brick", number: 5 },
    { resource: "ore", number: 9 },
    { resource: "sheep", number: 5 },
    { resource: "wheat", number: 9 },
    { resource: "ore", number: 3 },
    { resource: "sheep", number: 10 },
    { resource: "brick", number: 11 },
    { resource: "wheat", number: 5 },
    { resource: "wood", number: 9 },
    { resource: "sheep", number: 4 },
    { resource: "wheat", number: 10 },
    { resource: "wood", number: 3 },
    { resource: "ore", number: 11 },
    { resource: "brick", number: 4 },
    { resource: "sheep", number: 9 },
    { resource: "wheat", number: 5 },
  ] satisfies Tile[]),
];
export const vertices: Vertex[] = standardVertices.map((v) => ({
  ...v,
  tiles: [...v.tiles],
  neighbors: [...v.neighbors],
}));
centers.slice(standardCenters.length).forEach((center, index) => {
  const corners = Array.from({ length: 6 }, (_, i) => {
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
    vertex.tiles.push(index + standardCenters.length);
    return vertex.id;
  });
  corners.forEach((id, i) => {
    const next = corners[(i + 1) % 6];
    if (!vertices[id].neighbors.includes(next))
      vertices[id].neighbors.push(next);
    if (!vertices[next].neighbors.includes(id))
      vertices[next].neighbors.push(id);
  });
});
