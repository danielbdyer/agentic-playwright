/**
 * Facet renderer: `policy-search:policyNumberInput`.
 *
 * Canonical: `<input type="text">` — role="textbox",
 * accessible name "Policy Number" (via aria-label).
 *
 * Hooks honored:
 *   hide-target: true      → style.display: none
 *   disable-target: true   → disabled attribute set (not-enabled;
 *                            also maps to not-editable)
 */

import type { FC } from 'react';
import type { FacetRenderer, FacetRendererProps } from '../../../substrate/facet-renderer';

const Component: FC<FacetRendererProps> = ({ hooks }) => {
  const hidden = hooks['hide-target'] === true;
  const disabled = hooks['disable-target'] === true;
  return (
    <input
      type="text"
      aria-label="Policy Number"
      data-facet-id="policy-search:policyNumberInput"
      style={hidden ? { display: 'none' } : undefined}
      disabled={disabled}
    />
  );
};

export const policyNumberInputRenderer: FacetRenderer = {
  facetId: 'policy-search:policyNumberInput',
  Component,
};
