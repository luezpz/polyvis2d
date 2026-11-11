/**
 * Serializes compiled BSP + portals + PVS for consumption by a game engine.
 *
 * Two equivalent encodings are provided:
 *
 * - **JSON** (`polyvis-pvs-2d`): self-describing, easy to load anywhere.
 * - **Text** (`.pvs.txt`): line-oriented, trivially parsed with `sscanf` /
 *   `StreamReader` without a JSON library. See {@link exportPvsText}.
 *
 * Runtime usage in an engine:
 *   1. Walk the BSP from the root with the camera position to find its leaf
 *      (front if `dot(n, p) - d >= 0`, else back; negative refs are leaves).
 *   2. Decode that leaf's PVS row; draw only objects in visible leaves.
 *
 * PVS rows: bit `j` of row `i` set ⇔ leaf `j` is potentially visible from
 * leaf `i`. Hex, two characters per byte, bit `j` in byte `j >> 3` at bit
 * position `j & 7` (LSB first).
 */

import type { CompileResult } from "../pipeline";
import type { Vec2 } from "../math";

export const PVS_FORMAT = "polyvis-pvs-2d";
export const PVS_VERSION = 1;

type P2 = [number, number];
const p2 = (v: Vec2): P2 => [round(v.x), round(v.y)];
const round = (x: number): number => Math.round(x * 1e6) / 1e6;

export interface PvsDocument {
  readonly format: typeof PVS_FORMAT;
  readonly version: typeof PVS_VERSION;
  readonly bounds: { readonly min: P2; readonly max: P2 };
  /** `[nx, ny, d]` — front half-space is `nx*x + ny*y - d >= 0`. */
  readonly planes: readonly [number, number, number][];
  /** `[plane, frontRef, backRef]`; refs `>= 0` are nodes, `< 0` are leaf `-ref - 1`. */
  readonly nodes: readonly [number, number, number][];
  readonly root: number;
  readonly leaves: readonly {
    readonly contents: "empty" | "solid";
    /** Convex CCW polygon, or null for degenerate leaves. */
    readonly polygon: readonly P2[] | null;
    /** Ids of portals leading out of this leaf. */
    readonly portals: readonly number[];
  }[];
  readonly portals: readonly { readonly from: number; readonly to: number; readonly a: P2; readonly b: P2 }[];
  readonly pvs: { readonly encoding: "hex-lsb"; readonly rows: readonly string[] };
}

export function buildPvsDocument(result: CompileResult): PvsDocument {
  const { tree, graph, pvs } = result;
  return {
    format: PVS_FORMAT,
    version: PVS_VERSION,
    bounds: { min: p2(tree.bounds.min), max: p2(tree.bounds.max) },
    planes: tree.planes.map((l) => [round(l.n.x), round(l.n.y), round(l.d)]),
    nodes: tree.nodes.map((n) => [n.plane, n.front, n.back]),
    root: tree.root,
    leaves: tree.leaves.map((l, i) => ({
      contents: l.contents,
      polygon: l.region ? l.region.vertices.map(p2) : null,
      portals: [...graph.portalsFrom[i]],
    })),
    portals: graph.portals.map((p) => ({ from: p.from, to: p.to, a: p2(p.seg.a), b: p2(p.seg.b) })),
    pvs: { encoding: "hex-lsb", rows: pvs.map((r) => r.toHex()) },
  };
}

export const exportPvsJson = (result: CompileResult): string => JSON.stringify(buildPvsDocument(result));

/**
 * Line-oriented text format:
 *
 * ```
 * polyvis-pvs-2d 1
 * bounds <minx> <miny> <maxx> <maxy>
 * planes <count>
 * <nx> <ny> <d>                       (× count)
 * nodes <count> root <ref>
 * <plane> <front> <back>              (× count)
 * leaves <count>
 * <empty|solid> <nverts> <x y>...     (× count; nverts may be 0)
 * portals <count>
 * <from> <to> <ax> <ay> <bx> <by>     (× count)
 * pvs <count> hex-lsb
 * <hex row>                           (× count; "-" for an all-zero row)
 * ```
 */
export function exportPvsText(result: CompileResult): string {
  const doc = buildPvsDocument(result);
  const lines: string[] = [];
  lines.push(`${doc.format} ${doc.version}`);
  lines.push(`bounds ${doc.bounds.min.join(" ")} ${doc.bounds.max.join(" ")}`);
  lines.push(`planes ${doc.planes.length}`);
  for (const p of doc.planes) lines.push(p.join(" "));
  lines.push(`nodes ${doc.nodes.length} root ${doc.root}`);
  for (const n of doc.nodes) lines.push(n.join(" "));
  lines.push(`leaves ${doc.leaves.length}`);
  for (const l of doc.leaves) lines.push([l.contents, l.polygon?.length ?? 0, ...(l.polygon ?? []).flat()].join(" "));
  lines.push(`portals ${doc.portals.length}`);
  for (const p of doc.portals) lines.push([p.from, p.to, ...p.a, ...p.b].join(" "));
  lines.push(`pvs ${doc.pvs.rows.length} ${doc.pvs.encoding}`);
  for (const r of doc.pvs.rows) lines.push(/^0*$/.test(r) ? "-" : r);
  return lines.join("\n") + "\n";
}

/** Decodes one hex-lsb PVS row into the list of visible leaf indices. */
export function decodePvsRow(hex: string): number[] {
  const out: number[] = [];
  if (hex === "-") return out;
  for (let b = 0; b * 2 < hex.length; b++) {
    const byte = parseInt(hex.substr(b * 2, 2), 16);
    for (let bit = 0; bit < 8; bit++) if (byte & (1 << bit)) out.push(b * 8 + bit);
  }
  return out;
}
