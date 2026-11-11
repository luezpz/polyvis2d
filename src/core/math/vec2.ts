/**
 * Minimal immutable 2D vector toolkit.
 *
 * Vectors are plain `{ x, y }` objects so they serialize trivially and can be
 * created with literals. All functions are pure.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const neg = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y });

/** a + b * s */
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => ({ x: a.x + b.x * s, y: a.y + b.y * s });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** 2D cross product (z component of the 3D cross product). Positive if b is counter-clockwise from a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const lengthSq = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Returns the unit vector in the direction of `a`, or ZERO for a zero-length input. */
export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len > 0 ? { x: a.x / len, y: a.y / len } : ZERO;
}

/** Rotates 90 degrees counter-clockwise. For a direction a→b this is the "left" side. */
export const perpLeft = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

/** Rotates 90 degrees clockwise. */
export const perpRight = (a: Vec2): Vec2 => ({ x: a.y, y: -a.x });

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });

export const nearlyEqual = (a: Vec2, b: Vec2, eps: number): boolean => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

/** Formats a vector for debugging. */
export const formatVec = (a: Vec2, digits = 3): string => `(${a.x.toFixed(digits)}, ${a.y.toFixed(digits)})`;
