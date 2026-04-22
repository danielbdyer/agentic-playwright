/**
 * Synthetic substrate bootstrap — the entry the built bundle
 * loads into the browser.
 *
 * Reads window.location.href → parses WorldShape → mounts
 * SubstrateRenderer with the default topology registry so probes
 * can reference named compositions via `world.preset`.
 */

import { createRoot } from 'react-dom/client';
import { SubstrateRenderer } from './SubstrateRenderer';
import { parseWorldShapeFromUrl } from '../../substrate/world-shape';
import { createDefaultTopologyRegistry } from '../../substrate/test-topology-catalog';

function mountSubstrate(): void {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  const worldShape = parseWorldShapeFromUrl(window.location.href);
  const topologyRegistry = createDefaultTopologyRegistry();
  createRoot(rootElement).render(
    <SubstrateRenderer
      worldShape={worldShape}
      topologyRegistry={topologyRegistry}
    />,
  );
}

mountSubstrate();
