/**
 * SpatialCanvas — root R3F scene composing the spatial visualization.
 *
 * Layout (camera looking down -Z):
 *   x=-3..0  : ScreenPlane  — live DOM texture from screenshots
 *   x=-0.5   : GlassPane    — frosted separator
 *   x=0..3   : Knowledge    — (Phase 2: observatory nodes)
 *
 * Overlaid on the ScreenPlane:
 *   - SelectorGlows   — bioluminescent highlights on probed elements
 *   - ParticleTransport — arcing particles from DOM → knowledge space
 *
 * Postprocessing:
 *   - Bloom (UnrealBloomPass) for emissive glow interaction
 *
 * Progressive enhancement layers (composable, non-breaking):
 *   - Base: texture + glows + particles + glass (this file)
 *   - WebMCP: live DOM portal replacing texture (when available)
 *   - Observatory: knowledge graph nodes in 3D (Phase 2)
 */

import { memo, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { ProbeEvent, ScreenCapture, ViewportDimensions } from './types';
import { ScreenPlane } from './screen-plane';
import { SelectorGlows } from './selector-glows';
import { ParticleTransport } from './particle-transport';
import { GlassPane } from './glass-pane';
import type { McpCapabilities } from '../hooks/use-mcp-capabilities';

// ─── Layout Constants (pure, scene-level) ───

const SCENE_LAYOUT = {
  screen: { x: -1.8, width: 3, height: 2.2 },
  glass: { x: -0.1, width: 0.3, height: 2.4 },
  knowledge: { x: 1.8 },
  camera: { position: [0, 0, 4] as const, fov: 50 },
} as const;

// ─── Props ───

export interface SpatialCanvasProps {
  /** Active probe events from the ingestion queue. */
  readonly probes: readonly ProbeEvent[];
  /** Latest screen capture for the texture plane. */
  readonly capture: ScreenCapture | null;
  /** Viewport dimensions of the application under test. */
  readonly viewport: ViewportDimensions;
  /** Callback when a particle arrives at knowledge space. */
  readonly onParticleArrived?: (probeId: string) => void;
  /** Progressive enhancement: detected MCP capabilities. */
  readonly capabilities?: McpCapabilities;
}

// ─── Scene Content (separated for memo purity) ───

const SceneContent = memo(function SceneContent({
  probes,
  capture,
  viewport,
  onParticleArrived,
}: SpatialCanvasProps) {
  const { screen, glass, knowledge, } = SCENE_LAYOUT;

  // Derive probe-dependent values without re-creating the scene
  const activeProbes = useMemo(
    () => probes.filter((p) => p.found && p.boundingBox !== null),
    [probes],
  );

  return (
    <>
      {/* Ambient + directional for PBR glass material */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[2, 3, 4]} intensity={0.6} />

      {/* Live application DOM as textured plane */}
      <ScreenPlane
        width={screen.width}
        height={screen.height}
        position={[screen.x, 0, 0]}
        capture={capture}
      />

      {/* Bioluminescent element highlights overlaid on screen plane */}
      <SelectorGlows
        probes={activeProbes}
        viewport={viewport}
        planeWidth={screen.width}
        planeHeight={screen.height}
      />

      {/* Particle arcs from DOM elements toward knowledge space */}
      <ParticleTransport
        sources={activeProbes}
        viewport={viewport}
        planeWidth={screen.width}
        planeHeight={screen.height}
        targetX={knowledge.x}
        onArrived={onParticleArrived}
      />

      {/* Frosted glass separator between DOM and knowledge */}
      <GlassPane
        width={glass.width}
        height={glass.height}
        position={[glass.x, 0, 0.05]}
      />

      {/* Bloom makes emissive materials (glows, particles) bloom outward */}
      <EffectComposer>
        <Bloom
          intensity={0.8}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
});

// ─── Root Canvas ───

export const SpatialCanvas = memo(function SpatialCanvas(props: SpatialCanvasProps) {
  const { camera } = SCENE_LAYOUT;

  return (
    <Canvas
      camera={{ position: [...camera.position], fov: camera.fov }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
      dpr={[1, 2]}
    >
      <SceneContent {...props} />
    </Canvas>
  );
});
