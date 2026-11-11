/** Colour palette for the editor (dark theme). */

import type { BrushKind } from "../../core";

export const COLORS = {
  background: "#14161a",
  gridMinor: "#1d2026",
  gridMajor: "#272b33",
  axis: "#363c47",
  wall: "#e8e8e8",
  wallTick: "#8c8c8c",
  splitter: "#ff9f43",
  portal: "#ffd23f",
  portalDim: "rgba(255, 210, 63, 0.35)",
  portalSelected: "#ffffff",
  portalMightSee: "rgba(180, 120, 255, 0.85)",
  portalVis: "#3fe0ff",
  leafStroke: "rgba(255, 255, 255, 0.10)",
  pvsCurrent: "rgba(90, 220, 120, 0.55)",
  pvsVisible: "rgba(90, 220, 120, 0.22)",
  pvsHidden: "rgba(0, 0, 0, 0.55)",
  lineOfSight: "rgba(255, 255, 255, 0.10)",
  lineOfSightStroke: "rgba(255, 255, 255, 0.35)",
  probe: "#ffffff",
  leak: "#ff3b3b",
  selection: "#ffffff",
  hover: "rgba(255, 255, 255, 0.5)",
  handleFill: "#14161a",
  label: "rgba(255, 255, 255, 0.75)",
} as const;

export function kindColors(kind: BrushKind): { stroke: string; fill: string } {
  return kind === "room"
    ? { stroke: "#4da3ff", fill: "rgba(77, 163, 255, 0.10)" }
    : { stroke: "#ff5d73", fill: "rgba(255, 93, 115, 0.28)" };
}

/** Distinct, stable pastel colour per leaf index (golden-angle hue walk). */
export function leafColor(index: number, alpha = 0.16): string {
  const hue = (index * 137.508) % 360;
  return `hsla(${hue.toFixed(1)}, 65%, 60%, ${alpha})`;
}
