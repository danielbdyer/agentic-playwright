/**
 * SurfaceSpec — a world-shape described axiomatically.
 *
 * SurfaceSpec describes a DOM surface by the axes a classifier
 * actually probes:
 * role, accessible name, visibility, enabled state, input backing,
 * detach timing. A probe's WorldShape is an ordered list of
 * SurfaceSpecs — each one a point in axis-space.
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

/** The closed set of ARIA roles the substrate renders. Matches
 *  Playwright's getByRole first argument (`@playwright/test`). The
 *  v1 seed set below covers every role the current probe suite
 *  exercises plus the five ARIA landmark roles (banner,
 *  complementary, contentinfo, main, plus the existing navigation +
 *  region + search + form) — landmarks are first-class for observe
 *  probes that verify landmark-aware queries. */
export type SurfaceRole =
  | 'alert'
  | 'banner'
  | 'button'
  | 'checkbox'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'form'
  | 'grid'
  | 'gridcell'
  | 'heading'
  | 'link'
  | 'list'
  | 'listitem'
  | 'main'
  | 'navigation'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowheader'
  | 'search'
  | 'searchbox'
  | 'status'
  | 'tab'
  | 'tablist'
  | 'tabpanel'
  | 'textbox';

/** How the surface is (not) visible. */
export type SurfaceVisibility =
  | 'visible'
  | 'display-none'
  | 'visibility-hidden'
  | 'off-screen'
  | 'zero-size';

/** Backing realization for textbox-role surfaces. The choice drives
 *  whether Playwright's `fill()` succeeds or throws — exactly the
 *  axis the interact verb's `assertion-like` family rides on. */
export type InputBacking =
  | 'native-input'        // real <input type="text">
  | 'native-textarea'     // real <textarea>
  | 'div-with-role'       // <div role="textbox"> — fill() fails
  | 'contenteditable';    // <div contenteditable="true"> — fill() works

/** One point in axis-space. Every surface the substrate renders is
 *  described by one of these. */
export interface SurfaceSpec {
  /** ARIA role. Required. */
  readonly role: SurfaceRole;
  /** Accessible name. Optional — omitted means the surface has no
   *  explicit name (role-only query finds it generically). */
  readonly name?: string;
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
  Pick<SurfaceSpec, 'visibility' | 'enabled' | 'inputBacking'>
> = {
  visibility: 'visible',
  enabled: true,
  inputBacking: 'native-input',
};

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
  if (spec.role !== 'textbox') return false;
  const backing = spec.inputBacking ?? SURFACE_SPEC_DEFAULTS.inputBacking;
  return backing === 'div-with-role';
}
