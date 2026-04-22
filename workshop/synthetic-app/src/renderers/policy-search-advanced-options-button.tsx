/**
 * Facet renderer: `policy-search:advancedOptionsButton`.
 *
 * Canonical: `<button>Advanced Options</button>` — role="button",
 * accessible name "Advanced Options".
 *
 * Hooks honored:
 *   hide-target: true      → style.display: none (not-visible)
 *   disable-target: true   → disabled attribute set (not-enabled)
 */

import type { FC } from 'react';
import type { FacetRenderer, FacetRendererProps } from '../../../substrate/facet-renderer';

const Component: FC<FacetRendererProps> = ({ hooks }) => {
  const hidden = hooks['hide-target'] === true;
  const disabled = hooks['disable-target'] === true;
  return (
    <button
      data-facet-id="policy-search:advancedOptionsButton"
      style={hidden ? { display: 'none' } : undefined}
      disabled={disabled}
    >
      Advanced Options
    </button>
  );
};

export const advancedOptionsButtonRenderer: FacetRenderer = {
  facetId: 'policy-search:advancedOptionsButton',
  Component,
};
