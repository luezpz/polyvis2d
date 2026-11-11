/**
 * Numeric tolerances shared by the whole compiler.
 *
 * World units are arbitrary but the editor assumes roughly "1 unit = 1 metre"
 * with levels spanning tens to a few thousand units. All tolerances are
 * absolute and tuned for that range.
 */

/** Distance below which a point is considered to lie *on* a line/plane. */
export const PLANE_EPSILON = 1e-5;

/** Segments/edges shorter than this are treated as degenerate and dropped. */
export const MIN_LENGTH = 1e-4;

/** Polygons with an area below this are treated as degenerate and dropped. */
export const MIN_AREA = 1e-6;

/**
 * Offset used when probing "just in front of" / "just behind" a boundary
 * (e.g. to classify which side of a wall is empty space). Must be larger than
 * {@link PLANE_EPSILON} and smaller than the smallest feature in a level.
 */
export const PROBE_OFFSET = 1e-3;

/** Grid used to quantize coordinates into hash keys for de-duplication. */
export const KEY_QUANTUM = 1e-4;
