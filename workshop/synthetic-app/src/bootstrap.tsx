/**
 * Synthetic substrate bootstrap — the entry the built bundle
 * loads into the browser.
 *
 * Reads window.location.href → parses WorldConfig → mounts
 * SubstrateRenderer with the default registry. That's the whole
 * job. Every other moving part lives in workshop/substrate/ or
 * the leaf renderers.
 *
 * On a URL without a parseable `world` param, SubstrateRenderer
 * renders a `data-substrate-state="no-world"` marker. The harness
 * never navigates to such a URL; if a human operator opens the
 * server's root URL in a browser, they see the instructive marker
 * instead of a blank page.
 */

import { createRoot } from 'react-dom/client';
import { SubstrateRenderer } from './SubstrateRenderer';
import { parseWorldConfigFromUrl } from '../../substrate/world-config';
import { createDefaultFacetRendererRegistry } from './renderers/registry';

function mountSubstrate(): void {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  const registry = createDefaultFacetRendererRegistry();
  const worldConfig = parseWorldConfigFromUrl(window.location.href);
  createRoot(rootElement).render(
    <SubstrateRenderer registry={registry} worldConfig={worldConfig} />,
  );
}

mountSubstrate();
