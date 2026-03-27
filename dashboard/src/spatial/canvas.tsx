/**
 * SpatialCanvas — root R3F scene composing the spatial visualization.
 *
 * Layout (camera looking down -Z):
 *   x=-3..0  : ScreenPlane  — live DOM texture from screenshots
 *   x=-0.5   : GlassPane    — frosted separator / proposal gate
 *   x=0..3   : Knowledge    — observatory nodes + crystallization
 *
 * Overlaid on the ScreenPlane:
 *   - SelectorGlows      — bioluminescent highlights on probed elements
 *   - ParticleTransport   — arcing particles from DOM → knowledge space
 *
 * At the GlassPane:
 *   - ProposalGate        — proposals split: activated through, blocked reflect
 *   - ArtifactAurora      — brief emissive flashes on artifact writes
 *
 * Scene-wide:
 *   - IterationPulse      — ambient light modulation on iteration heartbeat
 *
 * Postprocessing:
 *   - Bloom (UnrealBloomPass) for emissive glow interaction
 *
 * Progressive enhancement layers (composable, non-breaking):
 *   Layer 0: texture + glows + particles + glass (base)
 *   Layer 1: live DOM portal replaces texture (iframe behind canvas)
 *   Layer 2: MCP tools expose same data structurally (agent access)
 *   Layer 3: convergence + proposals + aurora (self-improving loop)
 */

import { memo, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { ProbeEvent, ScreenCapture, ViewportDimensions, KnowledgeNode, ProposalActivatedEvent, ArtifactWrittenEvent } from './types';
import { ScreenPlane } from './screen-plane';
import { SelectorGlows } from './selector-glows';
import { ParticleTransport } from './particle-transport';
import { GlassPane } from './glass-pane';
import { KnowledgeObservatory } from './knowledge-observatory';
import { ProposalGate } from './proposal-gate';
import { IterationPulse } from './iteration-pulse';
import { ArtifactAurora } from './artifact-aurora';

/** Module-level no-op tick — stable identity without useMemo. */
const noopTick = (): number => 0;

// ─── Layout Constants (pure, scene-level) ───

export const SCENE_LAYOUT = {
  screen: { x: -1.8, width: 3, height: 2.2 },
  glass: { x: -0.1, width: 0.3, height: 2.4 },
  knowledge: { x: 1.8 },
  camera: { position: [0, 0, 4] as const, fov: 50 },
} as const;

// ─── Props ───

export interface SpatialCanvasProps {
  /** Active probe events from the ingestion queue. */
  readonly probes: readonly ProbeEvent[];
  /** Latest screen capture for the texture plane (Layer 0). Null if portal active. */
  readonly capture: ScreenCapture | null;
  /** Viewport dimensions of the application under test. */
  readonly viewport: ViewportDimensions;
  /** Knowledge nodes for the observatory (right side of glass). */
  readonly knowledgeNodes?: readonly KnowledgeNode[];
  /** Callback when a particle arrives at knowledge space. */
  readonly onParticleArrived?: (probeId: string) => void;
  /** When true, skip ScreenPlane rendering (live portal handles the visual). */
  readonly portalActive?: boolean;
  /** Proposal activation events for the gate visualization. */
  readonly proposalEvents?: readonly ProposalActivatedEvent[];
  /** Artifact write events for the aurora visualization. */
  readonly artifactEvents?: readonly ArtifactWrittenEvent[];
  /** Iteration pulse tick function from useIterationPulse. */
  readonly iterationTick?: (delta: number) => number;
}

// ─── Scene Content (separated for memo purity) ───

const SceneContent = memo(function SceneContent({
  probes,
  capture,
  viewport,
  knowledgeNodes = [],
  onParticleArrived,
  portalActive = false,
  proposalEvents = [],
  artifactEvents = [],
  iterationTick,
}: SpatialCanvasProps) {
  const { screen, glass, knowledge } = SCENE_LAYOUT;

  const activeProbes = useMemo(
    () => probes.filter((p) => p.found && p.boundingBox !== null),
    [probes],
  );

  // noopTick is module-level (stable identity without useMemo)

  return (
    <>
      {/* Scene-wide ambient modulated by iteration pulse */}
      {iterationTick
        ? <IterationPulse tick={iterationTick} />
        : <ambientLight intensity={0.3} />
      }
      <directionalLight position={[2, 3, 4]} intensity={0.6} />

      {/* Layer 0: Screenshot texture — hidden when live portal is active */}
      {!portalActive && (
        <ScreenPlane
          width={screen.width}
          height={screen.height}
          position={[screen.x, 0, 0]}
          capture={capture}
        />
      )}

      {/* Bioluminescent element highlights — works on both layers */}
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

      {/* Layer 3: Proposal gate — particles split at glass pane */}
      {proposalEvents.length > 0 && (
        <ProposalGate
          events={proposalEvents}
          glassX={glass.x}
          targetX={knowledge.x}
        />
      )}

      {/* Layer 3: Artifact aurora — brief flashes at glass pane */}
      {artifactEvents.length > 0 && (
        <ArtifactAurora
          events={artifactEvents}
          position={[glass.x, 0, 0.06]}
        />
      )}

      {/* Knowledge observatory — crystallized nodes on the right */}
      <KnowledgeObservatory
        nodes={knowledgeNodes}
        centerX={knowledge.x}
        height={screen.height}
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
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1, // Above iframe portal, below UI controls
      }}
      dpr={[1, 2]}
    >
      <SceneContent {...props} />
    </Canvas>
  );
});
