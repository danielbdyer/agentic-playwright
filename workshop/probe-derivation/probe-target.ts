/**
 * Probe target — the closed set of ways a browser-bound probe can
 * name the surface it acts on, shared by the rung-2 (world-shape
 * inspection) and rung-3 (live Playwright) classifiers so both
 * rungs agree on what a target means.
 *
 * Three shapes, one per way real DOM lets a locator reach an
 * element (docs/v2-substrate-reality-study.md §2):
 *
 *   { role, name?, inRow? } — role query; the accessible name is
 *                       whatever accname computes (aria-label,
 *                       <label>, placeholder, content). `inRow`
 *                       scopes the query to the `row` whose accessible
 *                       name (from its cells' content) contains the
 *                       text — the C7 shape: an unnamed checkbox
 *                       reachable only through its row.
 *   { placeholder }   — `getByPlaceholder`; the emitted-locator kind
 *                       the product's LocatorStrategyKind already
 *                       declares but no matcher produced (C1).
 *   { text }          — visible text, role-agnostic; the ONLY handle
 *                       a roleless interactive offers (F3 / C2).
 *
 * Pure. No Effect, no Playwright.
 */

import { accessibleNameOf, type SurfaceSpec } from '../substrate/surface-spec';

export type ProbeTarget =
  | { readonly kind: 'role'; readonly role: string; readonly name?: string; readonly inRow?: string }
  | { readonly kind: 'placeholder'; readonly placeholder: string }
  | { readonly kind: 'text'; readonly text: string };

export function foldProbeTarget<R>(
  target: ProbeTarget,
  cases: {
    readonly role: (t: Extract<ProbeTarget, { kind: 'role' }>) => R;
    readonly placeholder: (t: Extract<ProbeTarget, { kind: 'placeholder' }>) => R;
    readonly text: (t: Extract<ProbeTarget, { kind: 'text' }>) => R;
  },
): R {
  switch (target.kind) {
    case 'role':        return cases.role(target);
    case 'placeholder': return cases.placeholder(target);
    case 'text':        return cases.text(target);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse `probe.input.target`. Precedence when a fixture declares
 *  more than one key: role wins (it is the most specific query),
 *  then placeholder, then text. Returns null when no shape applies. */
export function parseProbeTarget(input: unknown): ProbeTarget | null {
  if (!isRecord(input)) return null;
  const target = input['target'];
  if (!isRecord(target)) return null;
  if (typeof target['role'] === 'string') {
    return {
      kind: 'role',
      role: target['role'],
      ...(typeof target['name'] === 'string' ? { name: target['name'] } : {}),
      ...(typeof target['inRow'] === 'string' ? { inRow: target['inRow'] } : {}),
    };
  }
  if (typeof target['placeholder'] === 'string') {
    return { kind: 'placeholder', placeholder: target['placeholder'] };
  }
  if (typeof target['text'] === 'string') {
    return { kind: 'text', text: target['text'] };
  }
  return null;
}

/** Does this surface satisfy the target under the substrate's
 *  declared accname semantics? Rung-2's prediction of rung-3. Row
 *  scoping is resolved by `findSurfaceForTarget`, which knows the
 *  tree; here a role target matches on role + name alone. */
export function surfaceMatchesTarget(surface: SurfaceSpec, target: ProbeTarget): boolean {
  return foldProbeTarget(target, {
    role: (t) =>
      surface.role === t.role &&
      (t.name === undefined || accessibleNameOf(surface) === t.name),
    placeholder: (t) => surface.placeholder === t.placeholder,
    // Text queries are role-agnostic: any surface whose visible
    // text equals the needle. The `generic` role has only this.
    text: (t) => surface.name === t.text,
  });
}

/** Depth-first search of a surface tree for the first surface that
 *  satisfies the target. Composed surfaces nest children, so the
 *  target may live at any depth. Recursive fold; no mutation. */
export function findSurfaceForTarget(
  surfaces: readonly SurfaceSpec[],
  target: ProbeTarget,
): SurfaceSpec | null {
  if (target.kind === 'role' && target.inRow !== undefined) {
    const row = resolveRowScope(surfaces, target.inRow);
    const { inRow: _inRow, ...unscoped } = target;
    return row === null ? null : findSurfaceForTarget(row.children ?? [], unscoped);
  }
  return surfaces.reduce<SurfaceSpec | null>((found, s) => {
    if (found !== null) return found;
    if (surfaceMatchesTarget(s, target)) return s;
    return s.children !== undefined ? findSurfaceForTarget(s.children, target) : null;
  }, null);
}

/** The unique `row` surface whose descendants carry the cell text.
 *  A row's accessible name comes from its content, so "the row
 *  containing X" is the row with a descendant named X. Null when no
 *  row or more than one row qualifies — at rung 3 the row query is
 *  then empty and the verb times out, which is what rung 2 must
 *  predict (a world without the row is a real world, not an
 *  inconsistent fixture). */
export function resolveRowScope(surfaces: readonly SurfaceSpec[], inRow: string): SurfaceSpec | null {
  const rows = collectSurfaces(surfaces).filter(
    (s) => s.role === 'row' && s.children !== undefined && collectSurfaces(s.children).some((d) => (d.name ?? '').includes(inRow)),
  );
  return rows.length === 1 ? rows[0]! : null;
}

/** Pre-order flattening of a surface tree. */
function collectSurfaces(surfaces: readonly SurfaceSpec[]): readonly SurfaceSpec[] {
  return surfaces.flatMap((s) => [s, ...(s.children !== undefined ? collectSurfaces(s.children) : [])]);
}
