/**
 * Substrate-vocabulary → renderer projection (Z11g.c).
 *
 * Per `docs/v2-substrate-ladder-plan.md §§5.5, 8.3, 9.3`, every
 * `SurfaceRole` in `workshop/substrate/surface-spec.ts`'s closed
 * union must have exactly one rendering strategy declared here.
 * The `Record<SurfaceRole, ...>` type forces coverage at
 * type-check time; adding a role to the union without adding
 * a projection entry fails the build.
 *
 * ## Strategy classification
 *
 * - `'specialized'` — `SurfaceRenderer.tsx` has an explicit
 *   `if (spec.role === '<role>')` handler producing a bespoke
 *   DOM realization (native `<button>`, `<input type="...">`,
 *   `<a>`, `<select>`, `<h2>`, `<form>` via FormRenderer).
 * - `'generic'` — the renderer falls through to the catchall
 *   `<div role={spec.role}>` path. Used for landmark /
 *   container roles where the div+role projection is
 *   semantically sufficient for classifier observations.
 *
 * ## What this file does NOT do
 *
 * It does not duplicate or re-specify the renderer; it is a
 * metadata projection that names which strategy each role uses.
 * The renderer is the source of truth for the actual DOM. The
 * L-Projection-Terminal law cross-checks the strategies against
 * the renderer source.
 */

import type { SurfaceRole } from '../substrate/surface-spec';

/** Rendering strategy tag. Closed union. */
export type SurfaceRoleStrategy = 'specialized' | 'generic';

/** One entry per role. `rationale` is the human-readable
 *  justification for the strategy choice; it does not
 *  participate in any law and exists for reviewer legibility. */
export interface SurfaceRoleProjection {
  readonly strategy: SurfaceRoleStrategy;
  readonly rationale: string;
}

/** The total projection. Keyed by `SurfaceRole` — type-check
 *  fails if any role is missing or if an orphan key is added.
 *
 *  When adding a new role to the `SurfaceRole` union:
 *   1. Add a runtime entry to `SURFACE_ROLE_VALUES`.
 *   2. Add a specialized handler to `SurfaceRenderer.tsx` OR
 *      rely on the generic catchall.
 *   3. Add a projection entry here naming the strategy.
 *
 *  When removing a role, reverse those steps.
 */
export const SURFACE_ROLE_PROJECTION: Record<SurfaceRole, SurfaceRoleProjection> = {
  alert: {
    strategy: 'generic',
    rationale:
      'Landmark-like role; div+role is the standard ARIA realization. Observe probes read role from the accessibility tree, not a bespoke tag.',
  },
  banner: {
    strategy: 'generic',
    rationale: 'ARIA landmark; div+role matches canonical realization.',
  },
  button: {
    strategy: 'specialized',
    rationale: 'Native <button> carries built-in enabled/disabled state + native click semantics the interact verb exercises.',
  },
  checkbox: {
    strategy: 'specialized',
    rationale: 'Native <input type="checkbox"> carries enabled/disabled + checked state the interact verb exercises.',
  },
  combobox: {
    strategy: 'specialized',
    rationale: 'Native <select> element; combobox role has bespoke initial-value rendering via <option>.',
  },
  complementary: {
    strategy: 'generic',
    rationale: 'ARIA landmark; div+role matches canonical realization.',
  },
  contentinfo: {
    strategy: 'generic',
    rationale: 'ARIA landmark; div+role matches canonical realization.',
  },
  form: {
    strategy: 'specialized',
    rationale: 'Stateful <form> rendered via FormRenderer — handles submitReveal, required-field validation, success/error alerts that form-related probes exercise.',
  },
  grid: {
    strategy: 'generic',
    rationale: 'Container role; div+role is the canonical realization for non-table-backed grids.',
  },
  gridcell: {
    strategy: 'generic',
    rationale: 'Container child role; div+role suffices.',
  },
  heading: {
    strategy: 'specialized',
    rationale: 'Native <h2> for semantic hierarchy; heading probes query the level as well as the accessible name.',
  },
  link: {
    strategy: 'specialized',
    rationale: 'Native <a href="#"> for navigable semantics; href="#" is safe synthetic anchor (no navigation).',
  },
  list: {
    strategy: 'generic',
    rationale: 'Container role; div+role matches canonical realization when list items are declared separately.',
  },
  listitem: {
    strategy: 'generic',
    rationale: 'Container child role; div+role suffices.',
  },
  main: {
    strategy: 'generic',
    rationale: 'ARIA landmark; div+role matches canonical realization.',
  },
  navigation: {
    strategy: 'generic',
    rationale: 'ARIA landmark; div+role matches canonical realization.',
  },
  radio: {
    strategy: 'specialized',
    rationale: 'Native <input type="radio"> carries enabled/disabled state; radio-group coordination lives at the parent radiogroup.',
  },
  radiogroup: {
    strategy: 'generic',
    rationale: 'Container role grouping radio surfaces; div+role is canonical.',
  },
  region: {
    strategy: 'generic',
    rationale: 'ARIA landmark (named region); div+role matches canonical realization.',
  },
  row: {
    strategy: 'generic',
    rationale: 'Container role for grid/table rows; div+role suffices.',
  },
  rowheader: {
    strategy: 'generic',
    rationale: 'Container child role; div+role suffices.',
  },
  search: {
    strategy: 'generic',
    rationale: 'ARIA landmark; div+role matches canonical realization.',
  },
  searchbox: {
    strategy: 'generic',
    rationale: 'Currently rendered via the generic fallback; specialized rendering as <input type="search"> is a future additive change once a probe needs it.',
  },
  status: {
    strategy: 'generic',
    rationale: 'Live-region landmark; div+role matches canonical realization.',
  },
  tab: {
    strategy: 'generic',
    rationale: 'Container child role for tablist; div+role suffices.',
  },
  tablist: {
    strategy: 'generic',
    rationale: 'Container role; div+role suffices.',
  },
  tabpanel: {
    strategy: 'generic',
    rationale: 'Container role; div+role suffices.',
  },
  textbox: {
    strategy: 'specialized',
    rationale: 'Multiple backing realizations (native-input / native-textarea / div-with-role / contenteditable) the interact verb exercises; the renderer picks via spec.backing axis.',
  },
};
