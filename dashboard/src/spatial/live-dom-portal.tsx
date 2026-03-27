/**
 * Live DOM Portal — iframe embedding of the application under test.
 *
 * Progressive enhancement Layer 1: when the app under test is reachable
 * at a known URL, render it in an iframe behind the R3F canvas. The
 * Three.js overlay (glows, particles, glass) renders on top via
 * transparent WebGL compositing.
 *
 * The coordinate mapping is identical to the texture approach:
 * bounding boxes come from the Effect fiber's Playwright probes,
 * not from iframe DOM queries. The iframe is purely visual.
 *
 * CSS compositing strategy:
 *   z-index 0: iframe (live app DOM)
 *   z-index 1: R3F canvas (alpha: true, transparent background)
 *   Result: glows and particles visually overlay the live DOM
 */

import { memo, useState, useCallback } from 'react';

// ─── Types ───

interface LiveDomPortalProps {
  /** URL of the application under test. */
  readonly appUrl: string;
  /** Whether the portal should accept pointer events. */
  readonly interactive?: boolean;
  /** Callback when the iframe finishes loading. */
  readonly onLoad?: () => void;
}

// ─── Component ───

/** Renders the application under test in a positioned iframe.
 *  The iframe sits behind the R3F canvas — Three.js overlays
 *  composite on top via alpha transparency. */
export const LiveDomPortal = memo(function LiveDomPortal({
  appUrl,
  interactive = false,
  onLoad,
}: LiveDomPortalProps) {
  const [loaded, setLoaded] = useState(false);

  // React Compiler auto-memoizes this handler
  const handleLoad = () => {
    setLoaded(true);
    onLoad?.();
  };

  return (
    <iframe
      src={appUrl}
      onLoad={handleLoad}
      title="Application Under Test"
      sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 'none',
        zIndex: 0,
        pointerEvents: interactive ? 'auto' : 'none',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 400ms ease-out',
        // GPU layer promotion for smooth compositing
        willChange: 'opacity',
        transform: 'translateZ(0)',
      }}
    />
  );
});

// ─── Loading Indicator ───

interface PortalLoadingProps {
  readonly visible: boolean;
}

export const PortalLoading = memo(function PortalLoading({ visible }: PortalLoadingProps) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 3,
      pointerEvents: 'none',
      color: '#58a6ff',
      fontSize: 13,
      fontFamily: '-apple-system, sans-serif',
      opacity: 0.7,
    }}>
      Loading live portal...
    </div>
  );
});
