/**
 * Probe target — the closed set of ways a browser-bound probe can
 * name the surface it acts on, shared by the rung-2 (world-shape
 * inspection) and rung-3 (live Playwright) classifiers so both
 * rungs agree on what a target means.
 *
 * Three shapes, one per way real DOM lets a locator reach an
 * element (docs/v2-substrate-reality-study.md §2):
 *
 *   { role, name? }   — role query; the accessible name is whatever
 *                       accname computes (aria-label, <label>,
 *                       placeholder, content).
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
  | { readonly kind: 'role'; readonly role: string; readonly name?: string }
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
    return typeof target['name'] === 'string'
      ? { kind: 'role', role: target['role'], name: target['name'] }
      : { kind: 'role', role: target['role'] };
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
 *  declared accname semantics? Rung-2's prediction of rung-3. */
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
  return surfaces.reduce<SurfaceSpec | null>((found, s) => {
    if (found !== null) return found;
    if (surfaceMatchesTarget(s, target)) return s;
    return s.children !== undefined ? findSurfaceForTarget(s.children, target) : null;
  }, null);
}
