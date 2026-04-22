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
 *
 * The renderer is pure over (SurfaceSpec, time) except for the
 * detach hook's scheduling.
 */

import { useEffect, useState, type CSSProperties, type FC } from 'react';
import {
  SURFACE_SPEC_DEFAULTS,
  type SurfaceSpec,
  type SurfaceVisibility,
} from '../../substrate/surface-spec';

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
  // data-surface-role is stamped on every surface — classifiers use
  // it as a role-agnostic DOM lookup that works even when the
  // accessibility tree excludes the element (display:none et al.).
  const surfaceRoleAttr = { 'data-surface-role': spec.role };
  const surfaceNameAttr = spec.name !== undefined ? { 'data-surface-name': spec.name } : {};

  const commonRoleAttrs = {
    ...(style !== undefined ? { style } : {}),
    ...surfaceIdAttr,
    ...surfaceRoleAttr,
    ...surfaceNameAttr,
  };

  // Button surfaces.
  if (spec.role === 'button') {
    return (
      <button disabled={!enabled} {...commonRoleAttrs}>
        {spec.name ?? ''}
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
        // A div that *claims* to be a textbox but is not an input —
        // Playwright's fill() raises "Element is not an <input>".
        // Non-breaking space gives the empty element rendered
        // dimensions so isVisible() returns true.
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
    return <h2 {...commonRoleAttrs}>{spec.name ?? ''}</h2>;
  }

  // Region / alert / status / navigation / form / tabpanel — all div
  // containers with the declared role + optional accessible name.
  const nameAttr = spec.name !== undefined ? { 'aria-label': spec.name } : {};
  return (
    <div role={spec.role} {...nameAttr} {...commonRoleAttrs}>
      {spec.name ?? ''}
    </div>
  );
};
