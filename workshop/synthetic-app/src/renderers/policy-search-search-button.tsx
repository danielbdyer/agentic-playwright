/**
 * Facet renderer: `policy-search:searchButton`.
 *
 * Canonical: `<button>Search</button>` — role="button",
 * accessible name "Search".
 *
 * Hooks honored:
 *   hide-target: true             → style.display: none
 *   disable-target: true          → disabled attribute set
 *   detach-target-after-ms: N     → element removed after N ms
 *
 * The detach hook is stateful (useState + useEffect). Its
 * determinism is timing-bound: two runs at the same commit with
 * N=1 produce the same DOM sequence, but classifiers observing
 * across the detach must either poll (Playwright's default) or
 * race (exercising the timeout path the fixture asserts about).
 */

import { useEffect, useState, type FC } from 'react';
import type { FacetRenderer, FacetRendererProps } from '../../../substrate/facet-renderer';

const Component: FC<FacetRendererProps> = ({ hooks }) => {
  const hidden = hooks['hide-target'] === true;
  const disabled = hooks['disable-target'] === true;
  const detachAfterMs = typeof hooks['detach-target-after-ms'] === 'number'
    ? (hooks['detach-target-after-ms'] as number)
    : null;
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    if (detachAfterMs === null) return undefined;
    const id = setTimeout(() => setDetached(true), detachAfterMs);
    return () => clearTimeout(id);
  }, [detachAfterMs]);

  if (detached) return null;

  return (
    <button
      data-facet-id="policy-search:searchButton"
      style={hidden ? { display: 'none' } : undefined}
      disabled={disabled}
    >
      Search
    </button>
  );
};

export const searchButtonRenderer: FacetRenderer = {
  facetId: 'policy-search:searchButton',
  Component,
};
