/**
 * SurfaceSpec — a world-shape described axiomatically.
 *
 * SurfaceSpec describes a DOM surface by the axes a classifier
 * actually probes:
 * role, accessible name, naming mechanism, placeholder, click
 * affordance, visibility, enabled state, input backing, detach
 * timing. A probe's WorldShape is an ordered list of SurfaceSpecs
 * — each one a point in axis-space.
 *
 * ## Reality-study axes (2026-09-16)
 *
 * `docs/v2-substrate-reality-study.md §4` named four shapes real
 * OutSystems Reactive DOM exhibits that the substrate could not
 * pose: content/placeholder naming instead of explicit accessible
 * names (F2), interactive elements with no ARIA role at all (F3),
 * `<label for>`-named form controls (F2), and `data-block`
 * wrapper chrome (F5/F6 — see EntropyProfile.chromeVocabulary).
 * The `naming`, `placeholder`, `clickable` axes and the `generic`
 * role are the substrate's way of exhibiting them so the ladder's
 * blindness to them becomes measurable.
 *
 * ## Axis discipline
 *
 * Each field is one independent axis. Fields combine orthogonally.
 * Unspecified fields take the substrate's default (visible, enabled,
 * attached, native backing for inputs). The closed unions force
 * the renderer to handle every named case — adding a value to an
 * axis is an additive change; every renderer downstream must
 * acknowledge it via exhaustive fold.
 *
 * ## What SurfaceSpec is NOT
 *
 * - Not a business entity. "searchButton" carries no information the
 *   classifier consumes; it's named for human authors of a fake app.
 * - Not a DOM recipe. The renderer decides how to realize `role:
 *   'button'` in DOM (which elements, which attributes); the spec
 *   declares intent, not construction.
 * - Not stateful. The same SurfaceSpec always renders the same DOM
 *   (modulo the EntropyProfile the surrounding WorldShape carries).
 *
 * Pure domain; no React imports.
 */

import { closedUnion } from '../../product/domain/algebra/closed-union';

/** The closed set of ARIA roles the substrate renders. Matches
 *  Playwright's getByRole first argument (`@playwright/test`). The
 *  v1 seed set below covers every role the current probe suite
 *  exercises plus the five ARIA landmark roles (banner,
 *  complementary, contentinfo, main, plus the existing navigation +
 *  region + search + form) — landmarks are first-class for observe
 *  probes that verify landmark-aware queries.
 *
 *  `menu` / `menuitem` / `option` / `spinbutton` joined on 2026-09-17
 *  (handoff N4): the browser exposed all of them as interactive
 *  roles on the study routes (the top menu is a real ARIA `menu`;
 *  `<input type=number>` is a `spinbutton`; a `<select>`'s options
 *  are `option`s).
 *
 *  `generic` is ARIA's name for a roleless container (the implicit
 *  role of `<div>` / `<span>`). It renders as a bare `<div>` with NO
 *  `role` attribute; Playwright's role query cannot address it by
 *  name (verified: `getByRole('generic', { name })` returns 0). It
 *  exists so the substrate can pose reality-study F3 — a quarter of
 *  real Reactive controls are roleless `div`s with a click
 *  affordance — and so the ladder's text-only fallback can be
 *  measured against it. */
export type SurfaceRole =
  | 'alert'
  | 'banner'
  | 'button'
  | 'checkbox'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'form'
  | 'generic'
  | 'grid'
  | 'gridcell'
  | 'heading'
  | 'link'
  | 'list'
  | 'listitem'
  | 'main'
  | 'menu'
  | 'menuitem'
  | 'navigation'
  | 'option'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowheader'
  | 'search'
  | 'searchbox'
  | 'spinbutton'
  | 'status'
  | 'tab'
  | 'tablist'
  | 'tabpanel'
  | 'textbox';

/** Runtime witness for the SurfaceRole closed union.
 *
 *  Used by `workshop/synthetic-app/catalog-projection.ts`
 *  (projection-total law, plan §9.3 / Z11g.c) and by any caller
 *  that needs to iterate every role — fuzz-tests, manifest
 *  emission, dashboard projection.
 *
 *  Order mirrors the union declaration for human legibility. */
const SURFACE_ROLE_UNION = closedUnion<SurfaceRole>([
  'alert',
  'banner',
  'button',
  'checkbox',
  'combobox',
  'complementary',
  'contentinfo',
  'form',
  'generic',
  'grid',
  'gridcell',
  'heading',
  'link',
  'list',
  'listitem',
  'main',
  'menu',
  'menuitem',
  'navigation',
  'option',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowheader',
  'search',
  'searchbox',
  'spinbutton',
  'status',
  'tab',
  'tablist',
  'tabpanel',
  'textbox',
]);

export const SURFACE_ROLE_VALUES = SURFACE_ROLE_UNION.values;

/** How the surface is (not) visible. */
export type SurfaceVisibility =
  | 'visible'
  | 'display-none'
  | 'visibility-hidden'
  | 'off-screen'
  | 'zero-size';

/** Runtime witness for the SurfaceVisibility closed union. */
const SURFACE_VISIBILITY_UNION = closedUnion<SurfaceVisibility>([
  'visible',
  'display-none',
  'visibility-hidden',
  'off-screen',
  'zero-size',
]);

export const SURFACE_VISIBILITY_VALUES = SURFACE_VISIBILITY_UNION.values;

/** Exhaustive fold over SurfaceVisibility. TypeScript enforces
 *  coverage of every case at compile time; widening the union
 *  without updating the fold's case object is a type error. */
export function foldSurfaceVisibility<R>(
  visibility: SurfaceVisibility,
  cases: {
    readonly visible: () => R;
    readonly displayNone: () => R;
    readonly visibilityHidden: () => R;
    readonly offScreen: () => R;
    readonly zeroSize: () => R;
  },
): R {
  switch (visibility) {
    case 'visible':
      return cases.visible();
    case 'display-none':
      return cases.displayNone();
    case 'visibility-hidden':
      return cases.visibilityHidden();
    case 'off-screen':
      return cases.offScreen();
    case 'zero-size':
      return cases.zeroSize();
  }
}

/** Backing realization for textbox-role surfaces. The choice drives
 *  whether Playwright's `fill()` succeeds or throws — exactly the
 *  axis the interact verb's `assertion-like` family rides on. */
export type InputBacking =
  | 'native-input'        // real <input type="text">
  | 'native-textarea'     // real <textarea>
  | 'div-with-role'       // <div role="textbox"> — fill() fails
  | 'contenteditable';    // <div contenteditable="true"> — fill() works

/** How a form control's accessible name is realized in DOM. Real
 *  Reactive forms name inputs by `<label for>` (Productform, 6/7
 *  inputs) and search boxes by `placeholder` alone (5/7 routes);
 *  `aria-label` — the substrate's historical default — was 14% of
 *  the corpus. Each value is one DOM mechanism:
 *
 *    'aria-label'  → `aria-label="<name>"` on the control (default).
 *    'label-for'   → sibling `<label for=id>` + `id` on the control.
 *    'label-wrap'  → the control nested inside `<label>`.
 *    'none'        → no explicit name; the accessible name falls to
 *                    the `placeholder` axis (accname step 2D — the
 *                    browser and Playwright both apply it), or to
 *                    nothing when no placeholder is declared.
 *
 *  Ignored for roles that are not form controls (button/link name by
 *  content; containers by aria-label). */
export type FormControlNaming = 'aria-label' | 'label-for' | 'label-wrap' | 'none';

const FORM_CONTROL_NAMING_UNION = closedUnion<FormControlNaming>([
  'aria-label',
  'label-for',
  'label-wrap',
  'none',
]);

export const FORM_CONTROL_NAMING_VALUES = FORM_CONTROL_NAMING_UNION.values;

/** Exhaustive fold over FormControlNaming. */
export function foldFormControlNaming<R>(
  naming: FormControlNaming,
  cases: {
    readonly ariaLabel: () => R;
    readonly labelFor: () => R;
    readonly labelWrap: () => R;
    readonly none: () => R;
  },
): R {
  switch (naming) {
    case 'aria-label':
      return cases.ariaLabel();
    case 'label-for':
      return cases.labelFor();
    case 'label-wrap':
      return cases.labelWrap();
    case 'none':
      return cases.none();
  }
}

/** Roles whose `naming` + `placeholder` axes apply — the surfaces
 *  the renderer realizes as native form controls. */
const FORM_CONTROL_ROLES: ReadonlySet<SurfaceRole> = new Set<SurfaceRole>([
  'textbox',
  'searchbox',
  'spinbutton',
  'combobox',
  'checkbox',
  'radio',
]);

export function isFormControlRole(role: SurfaceRole): boolean {
  return FORM_CONTROL_ROLES.has(role);
}

/** One point in axis-space. Every surface the substrate renders is
 *  described by one of these. */
export interface SurfaceSpec {
  /** ARIA role. Required. */
  readonly role: SurfaceRole;
  /** Accessible name. Optional — omitted means the surface has no
   *  explicit name (role-only query finds it generically). For the
   *  `generic` role this is the element's visible text — the only
   *  handle a roleless surface offers. */
  readonly name?: string;
  /** Naming-mechanism axis for form-control roles. Default:
   *  'aria-label'. See `FormControlNaming`. */
  readonly naming?: FormControlNaming;
  /** Placeholder axis for form-control roles. Renders the
   *  `placeholder` attribute. When `naming` is 'none' (or `name` is
   *  absent) this becomes the accessible name — the reality-study's
   *  placeholder-only search inputs. */
  readonly placeholder?: string;
  /** Click-affordance axis for the `generic` role: renders
   *  `cursor: pointer` + a click handler on a roleless `<div>`, the
   *  shape real Reactive uses for filter toggles, back links and
   *  expandable headers. Default: false. Ignored for other roles
   *  (native controls carry their own affordance). */
  readonly clickable?: boolean;
  /** Visibility axis. Default: 'visible'. */
  readonly visibility?: SurfaceVisibility;
  /** Enabled state axis. Default: true. */
  readonly enabled?: boolean;
  /** Input backing for textbox-role surfaces. Ignored for
   *  non-textbox roles. Default: 'native-input'. */
  readonly inputBacking?: InputBacking;
  /** When present, the renderer schedules element removal after
   *  this many milliseconds. The classifier's click/fill retries
   *  then fail with Playwright's TimeoutError — the substrate's
   *  realization of the `timeout` error family. */
  readonly detachAfterMs?: number;
  /** Optional surface identifier. When present, the renderer
   *  stamps `data-surface-id` so classifiers can locate by ID
   *  as a tie-breaker when role+name aren't unique. */
  readonly surfaceId?: string;
  /** Optional initial value for input-backed surfaces. Renders as
   *  the `value` / `defaultValue` on the backing element. */
  readonly initialValue?: string;
  /** Child surfaces nested inside this surface. Enables composed
   *  ARIA topologies (tablist → tab + tabpanel; grid → row →
   *  gridcell; form → fieldset → inputs; landmark → content).
   *  The classifier's role-based query resolves children in the
   *  accessibility tree naturally — no special handling needed
   *  at the classifier; the substrate simply nests <element> …
   *  <children> … </element>. */
  readonly children?: readonly SurfaceSpec[];
  /** Required-field axis. Renders `aria-required="true"` on
   *  interactive surfaces (textbox, checkbox, radio, combobox).
   *  Form-level validation (on submit) treats required + empty
   *  as a precondition failure. */
  readonly required?: boolean;
  /** Validation-state axis. Renders `aria-invalid="true"`.
   *  Observe queries that filter on invalid state see the element;
   *  classifiers can assert the field is flagged. */
  readonly invalid?: boolean;
  /** aria-describedby target. The value should be another
   *  surface's `surfaceId`. Enables help-text + error-text
   *  compositions — probe can observe the described surface
   *  alongside the field. */
  readonly describedBy?: string;
  /** For role=form surfaces only. Determines what the form
   *  reveals on submit:
   *    'success-on-required-filled' — when every required child
   *      has a non-empty value at submit time, the form reveals
   *      a child tagged `surfaceId: 'submit-success'` (or an
   *      implicit success alert); otherwise reveals
   *      `submit-error` (or an implicit error alert).
   *    'always-success' — always reveals success.
   *    'always-error'   — always reveals error.
   *    'no-reveal'      — default; submit prevents default and
   *                       does nothing visible. */
  readonly submitReveal?:
    | 'success-on-required-filled'
    | 'always-success'
    | 'always-error'
    | 'no-reveal';
  /** For role=form: optional custom success-state message. Rendered
   *  as a role=status surface after a successful submit. */
  readonly successMessage?: string;
  /** For role=form: optional custom error-state message. Rendered
   *  as a role=alert surface after a failed submit. */
  readonly errorMessage?: string;
}

/** Default field resolution — the substrate applies these when a
 *  SurfaceSpec field is unspecified. Exported so classifiers and
 *  tests can refer to the same defaults. */
export const SURFACE_SPEC_DEFAULTS: Required<
  Pick<SurfaceSpec, 'visibility' | 'enabled' | 'inputBacking' | 'naming' | 'clickable'>
> = {
  visibility: 'visible',
  enabled: true,
  inputBacking: 'native-input',
  naming: 'aria-label',
  clickable: false,
};

/** The accessible name Playwright's role query would compute for
 *  the surface, given its naming axes. This is the substrate's
 *  statement of accname semantics, and rung-2 classifiers predict
 *  rung-3 through it:
 *
 *    - form controls named explicitly (aria-label / label-for /
 *      label-wrap) → `name`;
 *    - form controls with `naming: 'none'` → `placeholder` (accname
 *      2D; verified empirically against Chromium + Playwright on
 *      2026-09-16, which REFUTED the reality-study's claim that a
 *      role query cannot see a placeholder-named input);
 *    - the `generic` role → null: a roleless element has no
 *      role-addressable name, whatever its text;
 *    - every other role → `name`. */
export function accessibleNameOf(spec: SurfaceSpec): string | null {
  if (spec.role === 'generic') return null;
  if (!isFormControlRole(spec.role)) return spec.name ?? null;
  const naming = spec.naming ?? SURFACE_SPEC_DEFAULTS.naming;
  return foldFormControlNaming(naming, {
    ariaLabel: () => spec.name ?? spec.placeholder ?? null,
    labelFor: () => spec.name ?? spec.placeholder ?? null,
    labelWrap: () => spec.name ?? spec.placeholder ?? null,
    none: () => spec.placeholder ?? null,
  });
}

/** True when the surface renders with no ARIA role at all — the
 *  reality-study F3 shape. Role queries cannot reach it; only text
 *  (or a DOM handle) can. */
export function isSurfaceRoleless(spec: SurfaceSpec): boolean {
  return spec.role === 'generic';
}

/** True when the spec's visibility axis would render the surface
 *  invisible (excluded from the accessibility tree or outside the
 *  viewport). Callers use this to predict classifier outcomes. */
export function isSurfaceHidden(spec: SurfaceSpec): boolean {
  const visibility = spec.visibility ?? SURFACE_SPEC_DEFAULTS.visibility;
  return visibility !== 'visible';
}

/** True when the spec's input backing would make Playwright's
 *  `fill()` raise an internal assertion. */
export function isSurfaceFillRejecting(spec: SurfaceSpec): boolean {
  // A roleless <div> is never an <input>; fill() raises the same
  // "Element is not an <input>" assertion as div-with-role.
  if (spec.role === 'generic') return true;
  if (spec.role !== 'textbox') return false;
  const backing = spec.inputBacking ?? SURFACE_SPEC_DEFAULTS.inputBacking;
  return backing === 'div-with-role';
}
