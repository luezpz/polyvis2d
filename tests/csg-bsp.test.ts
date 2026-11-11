import { describe, expect, it } from "vitest";
import {
  buildWalls, buildBsp, locateLeaf, makeEmptySpaceTest, segmentLength, SAMPLE_LEVELS,
  aabbFromPoints, classifyPoints, convexContains, Side, type Wall,
} from "../src/core";
import { boxLevel, randomLevel, rng } from "./helpers";

const key = (p: { x: number; y: number }) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;

/** Every wall endpoint is the start of exactly as many walls as it is the end of. */
function expectClosed(walls: readonly Wall[]) {
  const balance = new Map<string, number>();
  for (const w of walls) {
    balance.set(key(w.seg.a), (balance.get(key(w.seg.a)) ?? 0) + 1);
    balance.set(key(w.seg.b), (balance.get(key(w.seg.b)) ?? 0) - 1);
  }
  for (const [, v] of balance) expect(v).toBe(0);
}

describe("CSG walls", () => {
  it("removes faces shared by touching rooms", () => {
    const level = boxLevel([["room", 0, 0, 8, 8], ["room", 8, 3, 10, 5], ["room", 10, 0, 18, 8]]);
    const walls = buildWalls(level.brushes);
    const perimeter = walls.reduce((s, w) => s + segmentLength(w.seg), 0);
    expect(perimeter).toBeCloseTo(30 + 30 + 4);
    expectClosed(walls);
  });

  it("merges overlapping rooms into a single outline", () => {
    const level = boxLevel([["room", 0, 0, 4, 4], ["room", 2, 2, 6, 6]]);
    const walls = buildWalls(level.brushes);
    expect(walls).toHaveLength(8);
    expect(walls.reduce((s, w) => s + segmentLength(w.seg), 0)).toBeCloseTo(24);
    expectClosed(walls);
  });

  it("de-duplicates identical rooms", () => {
    const level = boxLevel([["room", 0, 0, 4, 4], ["room", 0, 0, 4, 4]]);
    expect(buildWalls(level.brushes)).toHaveLength(4);
  });

  it("carves solid brushes as inward walls facing outwards", () => {
    const level = boxLevel([["room", 0, 0, 10, 10], ["solid", 4, 4, 6, 6]]);
    const walls = buildWalls(level.brushes);
    expect(walls).toHaveLength(8);
    expectClosed(walls);
    const isEmpty = makeEmptySpaceTest(level.brushes);
    for (const w of walls) {
      // The wall's front (normal side) must be empty space.
      const m = { x: (w.seg.a.x + w.seg.b.x) / 2 + w.line.n.x * 0.01, y: (w.seg.a.y + w.seg.b.y) / 2 + w.line.n.y * 0.01 };
      expect(isEmpty(m)).toBe(true);
    }
  });

  it("produces closed boundaries for random levels", () => {
    for (let seed = 1; seed <= 20; seed++) expectClosed(buildWalls(randomLevel(seed).brushes));
  });
});

describe("BSP", () => {
  it("classifies space exactly like the CSG", () => {
    for (const level of [...SAMPLE_LEVELS.map((s) => s.create()), randomLevel(3), randomLevel(7)]) {
      const walls = buildWalls(level.brushes);
      const { tree } = buildBsp(walls, { maxCellSize: 3 });
      const isEmpty = makeEmptySpaceTest(level.brushes);
      const r = rng(42);
      const { min, max } = tree.bounds;
      for (let i = 0; i < 2000; i++) {
        const p = { x: min.x + (max.x - min.x) * r(), y: min.y + (max.y - min.y) * r() };
        const leaf = tree.leaves[locateLeaf(tree, p)];
        expect(leaf.contents === "empty").toBe(isEmpty(p));
      }
    }
  });

  it("leaf regions tile the bounding box", () => {
    const level = SAMPLE_LEVELS[0].create();
    for (const options of [{ cornerSplits: false }, {}, { maxCellSize: 2 }]) {
      const { tree } = buildBsp(buildWalls(level.brushes), options);
      const area = tree.leaves.reduce((s, l) => s + (l.region ? polygonArea(l.region.vertices) : 0), 0);
      const { min, max } = tree.bounds;
      expect(area).toBeCloseTo((max.x - min.x) * (max.y - min.y), 3);
    }
  });

  it("never splits twice by the same plane along a root-to-leaf path (coplanar walls are consumed)", () => {
    for (const level of [...SAMPLE_LEVELS.map((s) => s.create()), randomLevel(5), randomLevel(9)]) {
      const { tree } = buildBsp(buildWalls(level.brushes), { maxCellSize: 3 });
      const walk = (ref: number, seen: Set<number>): void => {
        if (ref < 0) return;
        const node = tree.nodes[ref];
        expect(seen.has(node.plane)).toBe(false);
        const next = new Set(seen).add(node.plane);
        walk(node.front, next);
        walk(node.back, next);
      };
      walk(tree.root, new Set());
    }
  });
});

describe("BSP refinement", () => {
  const levels = () => [...SAMPLE_LEVELS.map((s) => s.create()), randomLevel(3), randomLevel(11)];

  it("corner splits: no wall touching an empty leaf extends through it", () => {
    for (const level of levels()) {
      const walls = buildWalls(level.brushes);
      const { tree, stats } = buildBsp(walls, { cornerSplits: true, minCellSize: 0 });
      expect(stats.refineSplitCount).toBeGreaterThan(0);
      for (const leaf of tree.leaves) {
        if (leaf.contents !== "empty" || !leaf.region) continue;
        for (const w of walls) {
          for (const p of [w.seg.a, w.seg.b]) {
            if (!convexContains(leaf.region.vertices, p)) continue;
            // Tolerance a bit above PLANE_EPSILON: a vertex grazing the line by PROBE_OFFSET is not a real split.
            expect(classifyPoints(w.line, leaf.region.vertices, 1e-3)).not.toBe(Side.Spanning);
          }
        }
      }
    }
  });

  it("corner splits add cells; disabling them restores the plain solid-leaf tree", () => {
    for (const level of levels()) {
      const walls = buildWalls(level.brushes);
      const plain = buildBsp(walls, { cornerSplits: false }).stats;
      const refined = buildBsp(walls, { cornerSplits: true }).stats;
      expect(plain.refineSplitCount).toBe(0);
      expect(refined.emptyLeafCount).toBeGreaterThanOrEqual(plain.emptyLeafCount);
      expect(refined.solidLeafCount).toBe(plain.solidLeafCount);
      expect(refined.splitCount).toBe(plain.splitCount);
    }
  });

  it("max cell size bounds every empty leaf", () => {
    for (const max of [1, 2.5, 6]) {
      for (const level of levels()) {
        const { tree } = buildBsp(buildWalls(level.brushes), { cornerSplits: false, minCellSize: 0, maxCellSize: max });
        for (const leaf of tree.leaves) {
          if (leaf.contents !== "empty" || !leaf.region) continue;
          const b = aabbFromPoints(leaf.region.vertices)!;
          expect(Math.max(b.max.x - b.min.x, b.max.y - b.min.y)).toBeLessThanOrEqual(max + 1e-6);
        }
      }
    }
  });

  it("min cell size prevents refinement slivers", () => {
    const min = 1.5;
    for (const level of levels()) {
      const { tree } = buildBsp(buildWalls(level.brushes), { cornerSplits: true, minCellSize: min, maxCellSize: 2 });
      // Every refinement node splits its region into two parts at least `min` thick along its normal.
      for (const node of tree.nodes) {
        const children = [node.front, node.back];
        if (!children.every((c) => c < 0 && tree.leaves[~c].contents === "empty") || !node.region) continue;
        const line = tree.planes[node.plane];
        const d = node.region.vertices.map((v) => line.n.x * v.x + line.n.y * v.y - line.d);
        expect(Math.max(...d)).toBeGreaterThanOrEqual(min - 1e-6);
        expect(-Math.min(...d)).toBeGreaterThanOrEqual(min - 1e-6);
      }
    }
  });
});

function polygonArea(v: readonly { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < v.length; i++) {
    const p = v[i], q = v[(i + 1) % v.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
