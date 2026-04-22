/**
 * Facet renderer: `policy-search:freeformRegion`.
 *
 * Default: `<div role="region" aria-label="Freeform">...</div>`.
 *
 * When the `non-input-target` hook is set, renders
 * `<div role="textbox">` instead — a div that *claims* to be a
 * textbox via ARIA but is NOT an underlying `<input>` element.
 * Playwright's `fill()` raises an internal assertion against
 * such an element ("Element is not an <input>"), routing to the
 * `assertion-like` family in the interact verb's classifier.
 *
 * This is the rung-3 realization of the rung-2 hook — at rung 2
 * the hook was a Boolean flag the classifier read; at rung 3 the
 * DOM itself actually refuses the fill.
 */

import type { FC } from 'react';
import type { FacetRenderer, FacetRendererProps } from '../../../substrate/facet-renderer';

const Component: FC<FacetRendererProps> = ({ hooks }) => {
  const hidden = hooks['hide-target'] === true;
  const nonInput = hooks['non-input-target'] === true;
  const style = hidden ? { display: 'none' } : undefined;

  if (nonInput) {
    return (
      <div
        role="textbox"
        aria-label="Freeform"
        data-facet-id="policy-search:freeformRegion"
        style={style}
      >
        (non-input div posing as textbox)
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Freeform"
      data-facet-id="policy-search:freeformRegion"
      style={style}
    >
      Freeform region
    </div>
  );
};

export const freeformRegionRenderer: FacetRenderer = {
  facetId: 'policy-search:freeformRegion',
  Component,
};
