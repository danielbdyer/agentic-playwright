/**
 * SurfaceRenderer — one component, any SurfaceSpec.
 *
 * Renders a DOM element that realizes every SurfaceSpec axis:
 *
 *   role           → semantic element (<button>, <input>, <div
 *                    role="...">), wrapped in the right ARIA
 *                    conventions.
 *   name           → accessible-name mechanism appropriate to the
 *                    element (textContent / aria-label).
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
  type SurfaceSpec,
  type SurfaceVisibility,
} from '../../substrate/surface-spec';
import { FormRenderer } from './FormRenderer';

export interface SurfaceRendererProps {
  readonly spec: SurfaceSpec;
}

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

  // Textbox surfaces (four backing realizations).
  if (spec.role === 'textbox') {
    const nameAttr = spec.name !== undefined ? { 'aria-label': spec.name } : {};
    const valueAttr = spec.initialValue !== undefined ? { defaultValue: spec.initialValue } : {};
    switch (inputBacking) {
      case 'native-input':
        return (
          <input
            type="text"
            disabled={!enabled}
            {...nameAttr}
            {...valueAttr}
            {...commonRoleAttrs}
          />
        );
      case 'native-textarea':
        return (
          <textarea disabled={!enabled} {...nameAttr} {...valueAttr} {...commonRoleAttrs} />
        );
      case 'div-with-role':
        return (
          <div role="textbox" {...nameAttr} {...commonRoleAttrs}>
            {spec.initialValue ?? ' '}
          </div>
        );
      case 'contenteditable':
        return (
          <div contentEditable {...nameAttr} {...commonRoleAttrs}>
            {spec.initialValue ?? ' '}
          </div>
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
    const nameAttr = spec.name !== undefined ? { 'aria-label': spec.name } : {};
    return (
      <input type="checkbox" disabled={!enabled} {...nameAttr} {...commonRoleAttrs} />
    );
  }

  // Radio surfaces.
  if (spec.role === 'radio') {
    const nameAttr = spec.name !== undefined ? { 'aria-label': spec.name } : {};
    return (
      <input type="radio" disabled={!enabled} {...nameAttr} {...commonRoleAttrs} />
    );
  }

  // Combobox (a <select> element).
  if (spec.role === 'combobox') {
    const nameAttr = spec.name !== undefined ? { 'aria-label': spec.name } : {};
    return (
      <select disabled={!enabled} {...nameAttr} {...commonRoleAttrs}>
        <option value="">{spec.initialValue ?? ''}</option>
      </select>
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
  // searchbox.
  const nameAttr = spec.name !== undefined ? { 'aria-label': spec.name } : {};
  return (
    <div role={spec.role} {...nameAttr} {...commonRoleAttrs}>
      {spec.name ?? ''}
      {children}
    </div>
  );
};
