# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## What this is

A PVS (potentially visible set) baker: CSG → solid-leaf BSP → portals → portal flow → leaf PVS →
export. Currently 2D, with a browser editor. A 3D version for Blender levels is planned; keep
the 2D code shaped so it ports stage-by-stage (see `docs/ALGORITHMS.md#porting-to-3d`).

## Commands

```sh
npm run dev         # Vite dev server (editor)
npm test            # vitest (must pass before you finish)
npm run typecheck   # tsc --noEmit (must pass)
npm run build       # typecheck + bundle
```

## Architecture rules

- `src/core/` is a **pure library**: no DOM, no globals, no `window`/`document`, no app imports.
  It must run in Node (tests) and in workers. Each stage lives in its own folder with an
  `index.ts` barrel; `pipeline.ts` only wires stages together.
- `src/app/` is the editor. It may import `src/core` (via `../core` or `../../core` barrels),
  never the other way round.
- Data flowing between stages is immutable (`readonly` everywhere). Levels are immutable values;
  edits produce new levels.
- Keep modules small and single-purpose. Every exported function/type gets a doc comment that
  states conventions (orientation, units, null cases).

## Geometric conventions (do not break)

- A line/plane is `{ n, d }` with unit `n`; front = `n·p − d > 0`.
- Walls: empty space on the **left/front**. Leaf polygons: CCW, edges tagged with plane index.
- Portal `p`: normal points into `p.to`; its segment has `p.to` on the left.
- BSP child refs: `>= 0` node, `< 0` leaf `~ref`.
- Use the tolerances in `src/core/math/tolerance.ts`; don't sprinkle new epsilons.
- Clipping discards parts lying exactly on the clip plane.

## Testing expectations

- The PVS must be **conservative**: never miss a leaf that is actually visible. The randomized
  line-of-sight test in `tests/vis.test.ts` enforces this — never weaken it to make a change pass.
- Add a test for every bug fix and for every new stage/option. Prefer property-style tests over
  random levels (`tests/helpers.ts` has a seeded PRNG and level generator).
- When changing the UI, run the app and check it in a browser; type checks alone don't show
  rendering bugs.

## Style

- TypeScript strict mode; no `any`. Prefer plain objects + functions in `core`, classes only for
  stateful things (app, `BitSet`).
- No new runtime dependencies without a strong reason. The project has zero runtime deps.
- Code comments explain *why* and the algorithm, citing the reference (Golodetz, Teller, Quake)
  where relevant.
