/**
 * The compiler pipeline: level → walls → BSP → portals → vis → PVS.
 *
 * Each stage is a pure function in its own module; this file only wires them
 * together, records timings, and gathers statistics. The UI and tests both
 * go through here.
 */

import type { Level } from "./level";
import { type Wall, buildWalls } from "./csg";
import { type BspBuildOptions, type BspStats, type BspTree, buildBsp } from "./bsp";
import { type LeakReport, type PortalGraph, buildPortalGraph, detectLeaks } from "./portals";
import { type BitSet, type PortalFlowOptions, type PortalFlowStats, type PvsSymmetry, computeBaseVis, computeLeafPvs, computePortalFlow } from "./vis";

export interface CompileOptions {
  readonly bsp: Partial<BspBuildOptions>;
  readonly flow: Partial<PortalFlowOptions>;
  readonly symmetry: PvsSymmetry;
}

export const DEFAULT_COMPILE_OPTIONS: CompileOptions = Object.freeze({ bsp: {}, flow: {}, symmetry: "none" });

export interface StageTiming {
  readonly stage: string;
  readonly ms: number;
}

export interface VisSummary {
  readonly emptyLeafCount: number;
  /** Average number of leaves in an empty leaf's PVS. */
  readonly averageVisibleLeaves: number;
  /** Average fraction of empty leaves visible (1 = no culling at all). */
  readonly averageVisibleFraction: number;
  /** Average "might see" (base vis) set size per portal, for comparison with flow. */
  readonly averageMightSee: number;
  /** Average final portal vis set size. */
  readonly averagePortalVis: number;
}

export interface CompileResult {
  readonly walls: readonly Wall[];
  readonly tree: BspTree;
  readonly bspStats: BspStats;
  readonly graph: PortalGraph;
  readonly leaks: LeakReport;
  /** Base vis: per portal. */
  readonly mightSee: readonly BitSet[];
  /** Flow result: per portal. */
  readonly portalVis: readonly BitSet[];
  readonly flowStats: PortalFlowStats;
  /** Final PVS: one row per BSP leaf, bits indexed by leaf. */
  readonly pvs: readonly BitSet[];
  readonly summary: VisSummary;
  readonly timings: readonly StageTiming[];
}

/** Compiles a brush level. */
export function compileLevel(level: Level, options: Partial<CompileOptions> = {}): CompileResult {
  const timings: StageTiming[] = [];
  const walls = timed(timings, "csg", () => buildWalls(level.brushes));
  return compileWalls(walls, options, timings);
}

/**
 * Compiles raw walls (empty space on each wall's left). Use this entry point
 * for non-CSG input such as imported meshes, which may leak.
 */
export function compileWalls(walls: readonly Wall[], options: Partial<CompileOptions> = {}, timings: StageTiming[] = []): CompileResult {
  const opts: CompileOptions = { ...DEFAULT_COMPILE_OPTIONS, ...options };
  const { tree, stats: bspStats } = timed(timings, "bsp", () => buildBsp(walls, opts.bsp));
  const graph = timed(timings, "portals", () => buildPortalGraph(tree));
  const leaks = timed(timings, "leaks", () => detectLeaks(tree, graph));
  const mightSee = timed(timings, "base vis", () => computeBaseVis(graph));
  const { portalVis, stats: flowStats } = timed(timings, "portal flow", () => computePortalFlow(graph, mightSee, opts.flow));
  const pvs = timed(timings, "leaf pvs", () => computeLeafPvs(tree, graph, portalVis, opts.symmetry));
  return { walls, tree, bspStats, graph, leaks, mightSee, portalVis, flowStats, pvs, summary: summarize(tree, graph, mightSee, portalVis, pvs), timings };
}

function summarize(tree: BspTree, graph: PortalGraph, mightSee: readonly BitSet[], portalVis: readonly BitSet[], pvs: readonly BitSet[]): VisSummary {
  const empty = tree.leaves.map((l, i) => (l.contents === "empty" && l.region ? i : -1)).filter((i) => i >= 0);
  const visible = empty.reduce((s, i) => s + pvs[i].count(), 0);
  const avg = (rows: readonly BitSet[]) => (rows.length ? rows.reduce((s, r) => s + r.count(), 0) / rows.length : 0);
  return {
    emptyLeafCount: empty.length,
    averageVisibleLeaves: empty.length ? visible / empty.length : 0,
    averageVisibleFraction: empty.length ? visible / (empty.length * empty.length) : 0,
    averageMightSee: avg(mightSee),
    averagePortalVis: graph.portals.length ? avg(portalVis) : 0,
  };
}

function timed<T>(timings: StageTiming[], stage: string, fn: () => T): T {
  const t0 = performance.now();
  const result = fn();
  timings.push({ stage, ms: performance.now() - t0 });
  return result;
}
