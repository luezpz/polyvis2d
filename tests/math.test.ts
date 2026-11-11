import { describe, expect, it } from "vitest";
import {
  clipPolygon, clipSegmentFront, convexHull, lineFromPoints, makePolygon, signedArea, isConvexCCW,
  classifySegment, Side, BitSet,
} from "../src/core";

describe("line2", () => {
  it("front is to the left of a→b", () => {
    const l = lineFromPoints({ x: 0, y: 0 }, { x: 1, y: 0 })!;
    expect(l.n.x).toBeCloseTo(0);
    expect(l.n.y).toBeCloseTo(1);
    expect(classifySegment(l, { a: { x: 0, y: 1 }, b: { x: 1, y: 2 } })).toBe(Side.Front);
    expect(classifySegment(l, { a: { x: 0, y: -1 }, b: { x: 1, y: 1 } })).toBe(Side.Spanning);
    expect(classifySegment(l, { a: { x: 3, y: 0 }, b: { x: 5, y: 0 } })).toBe(Side.On);
  });
});

describe("clipSegmentFront", () => {
  const l = lineFromPoints({ x: 0, y: 0 }, { x: 0, y: 1 })!; // front = -x side
  it("keeps the front part", () => {
    const s = clipSegmentFront({ a: { x: -2, y: 0 }, b: { x: 2, y: 0 } }, l)!;
    expect(s.a.x).toBeCloseTo(-2);
    expect(s.b.x).toBeCloseTo(0);
  });
  it("discards segments lying on the line", () => {
    expect(clipSegmentFront({ a: { x: 0, y: 0 }, b: { x: 0, y: 3 } }, l)).toBeNull();
  });
});

describe("clipPolygon", () => {
  const square = makePolygon([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], [10, 11, 12, 13]);

  it("clips and tags the new edge", () => {
    const line = lineFromPoints({ x: 1, y: 0 }, { x: 1, y: 2 })!; // keep x < 1
    const out = clipPolygon(square, line, 99)!;
    expect(signedArea(out.vertices)).toBeCloseTo(2);
    expect(out.tags.filter((t) => t === 99)).toHaveLength(1);
    expect(new Set(out.tags)).toEqual(new Set([10, 12, 13, 99]));
  });

  it("handles clip lines through vertices", () => {
    const diag = lineFromPoints({ x: 0, y: 0 }, { x: 2, y: 2 })!; // keep upper-left triangle
    const out = clipPolygon(square, diag, 7)!;
    expect(out.vertices).toHaveLength(3);
    expect(signedArea(out.vertices)).toBeCloseTo(2);
    expect(out.tags.filter((t) => t === 7)).toHaveLength(1);
  });

  it("returns null when fully behind", () => {
    const line = lineFromPoints({ x: 5, y: 2 }, { x: 5, y: 0 })!; // keep x > 5
    expect(clipPolygon(square, line, 1)).toBeNull();
  });
});

describe("convexHull", () => {
  it("returns a CCW hull without interior or collinear points", () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 2 }]);
    expect(hull).toHaveLength(4);
    expect(isConvexCCW(hull)).toBe(true);
  });
});

describe("BitSet", () => {
  it("round-trips through hex", () => {
    const b = BitSet.fromIndices(70, [0, 3, 8, 31, 32, 69]);
    expect(b.count()).toBe(6);
    expect(BitSet.fromHex(70, b.toHex()).toArray()).toEqual([0, 3, 8, 31, 32, 69]);
    expect(b.toHex().slice(0, 4)).toBe("0901");
  });
});
