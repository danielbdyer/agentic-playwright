/**
 * Synthetic substrate bootstrap — the entry the built bundle
 * loads into the browser.
 *
 * Reads window.location.href → parses WorldShape → mounts
 * SubstrateRenderer. No registry lookups, no facet resolution.
 * The substrate renders what the shape declares, directly.
 */

import { createRoot } from 'react-dom/client';
import { SubstrateRenderer } from './SubstrateRenderer';
import { parseWorldShapeFromUrl } from '../../substrate/world-shape';

function mountSubstrate(): void {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  const worldShape = parseWorldShapeFromUrl(window.location.href);
  createRoot(rootElement).render(<SubstrateRenderer worldShape={worldShape} />);
}

mountSubstrate();
