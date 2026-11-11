import { describe, expect, it } from "vitest";
import {
  compileLevel, compileWalls, locateLeaf, leafComponents, makeWall, SAMPLE_LEVELS,
  exportPvsJson, exportPvsText, decodePvsRow, type Wall,
} from "../src/core";
import { boxLevel, emptyLeaves, lineOfSight, randomLevel, randomPointInLeaf, rng } from "./helpers";

describe("portals", () => {
  it("connects all empty leaves of a connected level", () => {
    for (const sample of SAMPLE_LEVELS) {
      const result = compileLevel(sample.create());
      const comp = leafComponents(result.tree, result.graph);
      const ids = new Set(emptyLeaves(result).map((l) => comp[l]));
      expect(ids.size, sample.name).toBe(1);
    }
  });

  it("creates consistent twin portals", () => {
    const { graph } = compileLevel(SAMPLE_LEVELS[0].create());
    expect(graph.portals.length % 2).toBe(0);
    for (const p of graph.portals) {
      const t = graph.portals[p.twin];
      expect(t.twin).toBe(p.id);
      expect(t.from).toBe(p.to);
      expect(t.to).toBe(p.from);
      // Twins lie on the same line with opposite orientation.
      expect(p.line.n.x * t.line.n.x + p.line.n.y * t.line.n.y).toBeCloseTo(-1);
    }
  });

  it("finds no leaks in CSG levels", () => {
    for (const sample of SAMPLE_LEVELS) expect(compileLevel(sample.create()).leaks.leaking).toBe(false);
  });

  it("detects leaks in open wall sets but still compiles", () => {
    // A box with one wall missing.
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const walls: Wall[] = [];
    for (let i = 0; i < 3; i++) walls.push(makeWall({ a: pts[i], b: pts[i + 1] })!);
    const result = compileWalls(walls);
    expect(result.leaks.leaking).toBe(true);
    expect(result.leaks.outsideLeaves.length).toBeGreaterThan(0);
  });
});

describe("PVS", () => {
  const leafAt = (r: ReturnType<typeof compileLevel>, x: number, y: number) => locateLeaf(r.tree, { x, y });

  it("two rooms joined by a doorway see each other", () => {
    const r = compileLevel(SAMPLE_LEVELS.find((s) => s.name === "Two rooms")!.create());
    for (const a of emptyLeaves(r)) for (const b of emptyLeaves(r)) expect(r.pvs[a].has(b)).toBe(true);
  });

  it("culls the far end of a zigzag corridor", () => {
    const r = compileLevel(SAMPLE_LEVELS.find((s) => s.name === "Zigzag")!.create());
    const start = leafAt(r, 3, 3);
    const end = leafAt(r, 27, 17);
    expect(r.tree.leaves[start].contents).toBe("empty");
    expect(r.tree.leaves[end].contents).toBe("empty");
    expect(r.pvs[start].has(end)).toBe(false);
    expect(r.pvs[end].has(start)).toBe(false);
    expect(r.summary.averageVisibleFraction).toBeLessThan(0.8);
  });

  it("is never stricter than true line of sight (sampled, sample levels + random levels)", () => {
    const levels = [...SAMPLE_LEVELS.map((s) => s.create()), ...Array.from({ length: 12 }, (_, i) => randomLevel(100 + i, 10))];
    const rand = rng(1234);
    let checked = 0;
    for (const level of levels) {
      const r = compileLevel(level);
      const leaves = emptyLeaves(r);
      for (let k = 0; k < 400; k++) {
        const a = leaves[Math.floor(rand() * leaves.length)];
        const b = leaves[Math.floor(rand() * leaves.length)];
        const p = randomPointInLeaf(r, a, rand);
        const q = randomPointInLeaf(r, b, rand);
        if (!p || !q || !lineOfSight(r.walls, p, q)) continue;
        checked++;
        expect(r.pvs[a].has(b), `leaf ${a} should see leaf ${b} (p=${p.x},${p.y} q=${q.x},${q.y})`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("symmetry modes are ordered: intersect ⊆ none ⊆ union", () => {
    const level = SAMPLE_LEVELS[0].create();
    const none = compileLevel(level, { symmetry: "none" }).pvs;
    const inter = compileLevel(level, { symmetry: "intersect" }).pvs;
    const union = compileLevel(level, { symmetry: "union" }).pvs;
    none.forEach((row, i) => {
      expect(inter[i].hasAnyNotIn(row)).toBe(false);
      expect(row.hasAnyNotIn(union[i])).toBe(false);
    });
  });

  it("flow is at least as tight as base vis", () => {
    const r = compileLevel(SAMPLE_LEVELS[0].create());
    r.portalVis.forEach((v, i) => expect(v.hasAnyNotIn(r.mightSee[i])).toBe(false));
  });
});

describe("export", () => {
  it("encodes the same PVS in JSON and text", () => {
    const r = compileLevel(boxLevel([["room", 0, 0, 6, 6], ["room", 6, 2, 12, 4], ["room", 10, 4, 12, 12], ["room", 12, 10, 18, 12]]));
    const doc = JSON.parse(exportPvsJson(r));
    expect(doc.format).toBe("polyvis-pvs-2d");
    doc.pvs.rows.forEach((row: string, i: number) => expect(decodePvsRow(row)).toEqual(r.pvs[i].toArray()));

    const text = exportPvsText(r).trim().split("\n");
    const pvsHeader = text.findIndex((l) => l.startsWith("pvs "));
    const rows = text.slice(pvsHeader + 1);
    expect(rows).toHaveLength(r.pvs.length);
    rows.forEach((row, i) => expect(decodePvsRow(row)).toEqual(r.pvs[i].toArray()));
  });
});
