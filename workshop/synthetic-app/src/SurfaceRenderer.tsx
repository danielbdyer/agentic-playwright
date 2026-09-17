/**
 * SurfaceRenderer — one component, any SurfaceSpec.
 *
 * Renders a DOM element that realizes every SurfaceSpec axis:
 *
 *   role           → semantic element (<button>, <input>, <div
 *                    role="...">), wrapped in the right ARIA
 *                    conventions. `generic` renders a bare <div>
 *                    with NO role attribute (reality-study F3).
 *   name           → accessible-name mechanism appropriate to the
 *                    element (textContent / aria-label / <label>).
 *   naming         → for form controls, WHICH mechanism realizes
 *                    the name: aria-label (default), a sibling
 *                    <label for=id>, a wrapping <label>, or none
 *                    (reality-study F2: real Reactive forms name by
 *                    <label for>; real search boxes by placeholder
 *                    alone).
 *   placeholder    → `placeholder` attribute on form controls, plus
 *                    `data-surface-placeholder` for the DOM handle.
 *   clickable      → on `generic`: cursor:pointer + click handler —
 *                    the roleless click affordance.
 *   visibility     → style/class carrying the CSS mechanism:
 *                      display-none      → { display: 'none' }
 *                      visibility-hidden → { visibility: 'hidden' }
 *                      off-screen        → absolute off-viewport
 *                      zero-size         → 0×0 clip
 *                      visible           → no overrides
 *   enabled        → `disabled` attribute on interactive elements.
 *   inputBacking   → native input vs div[role=textbox] vs
 *                    contenteditable div vs textarea.
 *   detachAfterMs  → stateful useState + setTimeout removal.
 *   surfaceId      → `data-surface-id` attribute (classifier
 *                    tie-breaker when role+name collide).
 *   initialValue   → defaultValue on backing input.
 *   children       → recursively-rendered nested SurfaceSpecs.
 *                    Enables ARIA compositions: tablist→tab+tabpanel,
 *                    grid→row→gridcell, form→fieldset→inputs,
 *                    landmark→content.
 *
 * The renderer is pure over (SurfaceSpec, time) except for the
 * detach hook's scheduling.
 */

import { useEffect, useState, type CSSProperties, type FC, type ReactNode } from 'react';
import {
  SURFACE_SPEC_DEFAULTS,
  foldFormControlNaming,
  type FormControlNaming,
  type SurfaceSpec,
  type SurfaceVisibility,
} from '../../substrate/surface-spec';
import { FormRenderer } from './FormRenderer';

export interface SurfaceRendererProps {
  readonly spec: SurfaceSpec;
}

/** Content for a value-less div-backed textbox. A non-breaking space
 *  (U+00A0) — a plain space collapses and the div renders with zero
 *  height, which Playwright reports as not visible; the NBSP keeps
 *  a line box so the visibility axis stays independent of the
 *  input-backing axis. Spelled as an escape so the invariant is
 *  legible in source rather than hidden in an invisible glyph. */
const EMPTY_CONTENT = '\u00A0';

/** Apply the visibility axis as inline style. Return undefined when
 *  the axis is 'visible' so the DOM element receives no style prop. */
function styleForVisibility(visibility: SurfaceVisibility): CSSProperties | undefined {
  switch (visibility) {
    case 'visible':
      return undefined;
    case 'display-none':
      return { display: 'none' };
    case 'visibility-hidden':
      return { visibility: 'hidden' };
    case 'off-screen':
      return { position: 'absolute', left: '-10000px', top: '-10000px' };
    case 'zero-size':
      return { width: 0, height: 0, overflow: 'hidden' };
  }
}

/** Render child SurfaceSpecs recursively. Returns null when no
 *  children are declared. */
function renderChildren(children: readonly SurfaceSpec[] | undefined): ReactNode {
  if (children === undefined) return null;
  return children.map((child, i) => (
    <SurfaceRenderer key={`${child.role}:${child.name ?? ''}:${i}`} spec={child} />
  ));
}

/** Deterministic element id for label-for naming. Derived from the
 *  surfaceId when present, otherwise from the name — the same spec
 *  always yields the same id (reproducibility law). */
function controlIdFor(spec: SurfaceSpec): string {
  const seed = spec.surfaceId ?? spec.name ?? spec.placeholder ?? spec.role;
  return `ctl-${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** The attributes the naming axis puts ON the control itself. The
 *  label element (for label-for / label-wrap) is added by
 *  `withLabel` around it. */
function controlNamingAttrs(
  spec: SurfaceSpec,
  naming: FormControlNaming,
): Record<string, string> {
  const placeholderAttrs: Record<string, string> =
    spec.placeholder !== undefined
      ? { placeholder: spec.placeholder, 'data-surface-placeholder': spec.placeholder }
      : {};
  return foldFormControlNaming<Record<string, string>>(naming, {
    ariaLabel: () => ({
      ...(spec.name !== undefined ? { 'aria-label': spec.name } : {}),
      ...placeholderAttrs,
    }),
    labelFor: () => ({ id: controlIdFor(spec), ...placeholderAttrs }),
    labelWrap: () => placeholderAttrs,
    none: () => placeholderAttrs,
  });
}

/** Wrap a rendered control in the label element its naming axis
 *  calls for. aria-label / none: the control alone. */
function withLabel(spec: SurfaceSpec, naming: FormControlNaming, control: ReactNode): ReactNode {
  return foldFormControlNaming<ReactNode>(naming, {
    ariaLabel: () => control,
    none: () => control,
    labelFor: () => (
      <>
        <label htmlFor={controlIdFor(spec)} data-surface-label-for={controlIdFor(spec)}>
          {spec.name ?? ''}
        </label>
        {control}
      </>
    ),
    labelWrap: () => (
      <label data-surface-label-wrap="">
        {spec.name ?? ''}
        {control}
      </label>
    ),
  });
}

export const SurfaceRenderer: FC<SurfaceRendererProps> = ({ spec }) => {
  const detachAfterMs = spec.detachAfterMs;
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    if (detachAfterMs === undefined) return undefined;
    const id = setTimeout(() => setDetached(true), detachAfterMs);
    return () => clearTimeout(id);
  }, [detachAfterMs]);

  if (detached) return null;

  const visibility = spec.visibility ?? SURFACE_SPEC_DEFAULTS.visibility;
  const enabled = spec.enabled ?? SURFACE_SPEC_DEFAULTS.enabled;
  const inputBacking = spec.inputBacking ?? SURFACE_SPEC_DEFAULTS.inputBacking;
  const naming = spec.naming ?? SURFACE_SPEC_DEFAULTS.naming;
  const clickable = spec.clickable ?? SURFACE_SPEC_DEFAULTS.clickable;
  const style = styleForVisibility(visibility);
  const surfaceIdAttr = spec.surfaceId !== undefined ? { 'data-surface-id': spec.surfaceId } : {};
  const surfaceRoleAttr = { 'data-surface-role': spec.role };
  const surfaceNameAttr = spec.name !== undefined ? { 'data-surface-name': spec.name } : {};
  // Form-field validation axes. Boolean-typed attributes use React's
  // standard name (ariaRequired / ariaInvalid) so React serializes
  // them correctly to aria-* in the DOM.
  const requiredAttr = spec.required === true ? ({ 'aria-required': true } as const) : {};
  const invalidAttr = spec.invalid === true ? ({ 'aria-invalid': true } as const) : {};
  const describedByAttr = spec.describedBy !== undefined ? { 'aria-describedby': spec.describedBy } : {};

  const commonRoleAttrs = {
    ...(style !== undefined ? { style } : {}),
    ...surfaceIdAttr,
    ...surfaceRoleAttr,
    ...surfaceNameAttr,
    ...requiredAttr,
    ...invalidAttr,
    ...describedByAttr,
  };

  const children = renderChildren(spec.children);

  // Button surfaces.
  if (spec.role === 'button') {
    return (
      <button disabled={!enabled} {...commonRoleAttrs}>
        {spec.name ?? ''}
        {children}
      </button>
    );
  }

  // Roleless surfaces (reality-study F3). A bare <div> with no role
  // attribute; its only handle is its visible text. `clickable`
  // adds the affordance real Reactive gives filter toggles and
  // expandable headers: cursor:pointer + a click handler. Playwright
  // reports isEnabled() true for any div, so the `enabled` axis is
  // not realizable here and is deliberately not read.
  if (spec.role === 'generic') {
    const clickStyle: CSSProperties | undefined = clickable
      ? { ...(style ?? {}), cursor: 'pointer' }
      : style;
    const affordanceAttr = clickable ? { 'data-surface-affordance': 'click' } : {};
    return (
      <div
        {...commonRoleAttrs}
        {...(clickStyle !== undefined ? { style: clickStyle } : {})}
        {...affordanceAttr}
        {...(clickable ? { onClick: (e: { preventDefault: () => void }) => e.preventDefault() } : {})}
      >
        {spec.name ?? ''}
        {children}
      </div>
    );
  }

  // Textbox surfaces (four backing realizations).
  if (spec.role === 'textbox') {
    const nameAttr = controlNamingAttrs(spec, naming);
    const valueAttr = spec.initialValue !== undefined ? { defaultValue: spec.initialValue } : {};
    switch (inputBacking) {
      case 'native-input':
        return withLabel(
          spec,
          naming,
          <input
            type="text"
            disabled={!enabled}
            {...nameAttr}
            {...valueAttr}
            {...commonRoleAttrs}
          />,
        );
      case 'native-textarea':
        return withLabel(
          spec,
          naming,
          <textarea disabled={!enabled} {...nameAttr} {...valueAttr} {...commonRoleAttrs} />,
        );
      case 'div-with-role':
        return withLabel(
          spec,
          naming,
          <div role="textbox" {...nameAttr} {...commonRoleAttrs}>
            {spec.initialValue ?? EMPTY_CONTENT}
          </div>,
        );
      case 'contenteditable':
        return withLabel(
          spec,
          naming,
          <div contentEditable {...nameAttr} {...commonRoleAttrs}>
            {spec.initialValue ?? EMPTY_CONTENT}
          </div>,
        );
    }
  }

  // Link surfaces.
  if (spec.role === 'link') {
    return (
      <a href="#" {...commonRoleAttrs}>
        {spec.name ?? ''}
        {children}
      </a>
    );
  }

  // Checkbox surfaces.
  if (spec.role === 'checkbox') {
    const nameAttr = controlNamingAttrs(spec, naming);
    return withLabel(
      spec,
      naming,
      <input type="checkbox" disabled={!enabled} {...nameAttr} {...commonRoleAttrs} />,
    );
  }

  // Radio surfaces.
  if (spec.role === 'radio') {
    const nameAttr = controlNamingAttrs(spec, naming);
    return withLabel(
      spec,
      naming,
      <input type="radio" disabled={!enabled} {...nameAttr} {...commonRoleAttrs} />,
    );
  }

  // Combobox (a <select> element).
  if (spec.role === 'combobox') {
    const nameAttr = controlNamingAttrs(spec, naming);
    return withLabel(
      spec,
      naming,
      <select disabled={!enabled} {...nameAttr} {...commonRoleAttrs}>
        <option value="">{spec.initialValue ?? ''}</option>
      </select>,
    );
  }

  // Spinbutton — a native <input type="number"> (handoff N4: real
  // forms expose numeric fields this way; QA prose still says
  // "field").
  if (spec.role === 'spinbutton') {
    const nameAttr = controlNamingAttrs(spec, naming);
    const valueAttr = spec.initialValue !== undefined ? { defaultValue: spec.initialValue } : {};
    return withLabel(
      spec,
      naming,
      <input type="number" disabled={!enabled} {...nameAttr} {...valueAttr} {...commonRoleAttrs} />,
    );
  }

  // Searchbox — a native <input type="search">, the element real
  // Reactive search fields are (placeholder-named, no label).
  if (spec.role === 'searchbox') {
    const nameAttr = controlNamingAttrs(spec, naming);
    const valueAttr = spec.initialValue !== undefined ? { defaultValue: spec.initialValue } : {};
    return withLabel(
      spec,
      naming,
      <input type="search" disabled={!enabled} {...nameAttr} {...valueAttr} {...commonRoleAttrs} />,
    );
  }

  // Heading.
  if (spec.role === 'heading') {
    return (
      <h2 {...commonRoleAttrs}>
        {spec.name ?? ''}
        {children}
      </h2>
    );
  }

  // Form surface — delegated to FormRenderer for stateful submit
  // handling. Supports submitReveal, required-field validation on
  // submit, and success/error alert rendering.
  if (spec.role === 'form') {
    const nameAttr = spec.name !== undefined ? { 'aria-label': spec.name } : {};
    const attrs = { ...nameAttr, ...commonRoleAttrs } as Record<string, string | undefined | CSSProperties>;
    return (
      <FormRenderer spec={spec} commonAttrs={attrs}>
        {children}
      </FormRenderer>
    );
  }

  // Container / landmark / composed roles — render as a div carrying
  // the declared role + optional accessible name + recursive children.
  // Covers: region, alert, status, navigation, main, banner,
  // complementary, contentinfo, search, grid, gridcell, row,
  // rowheader, list, listitem, radiogroup, tablist, tab, tabpanel,
  // menu, menuitem, option.
  const nameAttr = spec.name !== undefined ? { 'aria-label': spec.name } : {};
  return (
    <div role={spec.role} {...nameAttr} {...commonRoleAttrs}>
      {spec.name ?? ''}
      {children}
    </div>
  );
};
