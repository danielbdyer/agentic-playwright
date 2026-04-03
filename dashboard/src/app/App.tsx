/**
 * App — five-zone dashboard shell.
 *
 * Layout (grid-template-areas):
 *   ┌─────────────────────────────────┐
 *   │         presence-bar            │  ← connection, iteration, hit rate
 *   ├──────────────────────┬──────────┤
 *   │                      │          │
 *   │    surface-stage     │ inspector│  ← spatial canvas + overlays | panels
 *   │                      │  drawer  │
 *   ├──────────────────────┴──────────┤
 *   │        storyline-rail           │  ← horizontal pipeline timeline
 *   └─────────────────────────────────┘
 *
 * React North Star principles:
 *   1. Components render, they don't reason — logic lives in hooks and projections.
 *   2. Directory tree mirrors feature ownership (five-zone architecture).
 *   3. Pure projection layer separates derivation from presentation.
 *   4. Live (WebSocket), durable (REST/Query), and local UI state are distinct.
 *   5. The right file for a change is obvious before implementation.
 *
 * FP: all derived state is computed via pure functions; no mutation in render.
 * Memo-wrapped spatial scene via SpatialCanvas. Deferred values for non-blocking
 * high-frequency updates (probes, proposals, artifacts).
 */

import { useState, useCallback, useDeferredValue } from 'react';
import { SpatialCanvas, SCENE_LAYOUT } from '../spatial/canvas';
import { LiveDomPortal, PortalLoading } from '../spatial/live-dom-portal';
import { SceneErrorBoundary } from '../atoms/error-boundary';
import { useWebMcpCapabilities } from '../hooks/use-mcp-capabilities';
import { useDashboardObservations } from '../hooks/use-dashboard-observations';
import { useWorkbenchDecisions } from '../hooks/use-workbench-decisions';
import { ConvergencePanel } from '../organisms/convergence-panel';
import { ObservationPanel } from '../organisms/observation-panel';
import { StorylineRail } from '../organisms/storyline-rail';
import { StatusBar } from '../molecules/status-bar';
import { FitnessCard } from '../molecules/fitness-card';
import { ProgressCard } from '../molecules/progress-card';
import { QueueVisualization } from '../organisms/queue-visualization';
import { WorkbenchPanel } from '../organisms/workbench-panel';
import { CompletionsPanel } from '../organisms/completions-panel';
import { useDashboardRuntime } from '../features/workbench-runtime';
import {
  useFitnessData,
  useKnowledgeNodesData,
  useWorkbenchData,
} from '../features/workbench-runtime';
import { boundingBoxToPlaneWorld } from '../projections/overlays/overlay-geometry';
import type { ProbeEvent } from '../spatial/types';
import type { DecisionResult } from '../types';

// ─── Constants ───

const dashboardSocketUrl = (): string => `ws://${window.location.host}/ws`;

// ─── Pure derivations ───

/** Map a probe's bounding box to a 3D burst origin on the screen plane. Pure. */
const burstOriginForElement = (
  probes: readonly ProbeEvent[],
  element: string | null,
  viewport: { readonly width: number; readonly height: number },
): readonly [number, number, number] => {
  const probe = probes.find(
    (candidate) => candidate.element === element && candidate.boundingBox !== null,
  );

  if (!probe?.boundingBox) {
    return [SCENE_LAYOUT.screen.x, 0, 0.1];
  }

  const world = boundingBoxToPlaneWorld(probe.boundingBox, viewport, {
    x: SCENE_LAYOUT.screen.x,
    width: SCENE_LAYOUT.screen.width,
    height: SCENE_LAYOUT.screen.height,
    z: 0.1,
  });

  return [world.x, world.y, world.z];
};

// ─── App ───

export function App() {
  // ── Feature hooks (clean separation of concerns) ──
  const { data: workbench } = useWorkbenchData();
  const { data: scorecard } = useFitnessData();
  const { data: knowledgeNodes } = useKnowledgeNodesData();
  const observations = useDashboardObservations();

  const {
    connected,
    send,
    progress,
    queue,
    capture,
    appViewport,
    probeQueue,
    pauseContext,
    convergence,
    stageTracker,
    iterationPulse,
    proposalQueue,
    artifactQueue,
  } = useDashboardRuntime(dashboardSocketUrl());

  const {
    workbench: optimisticWorkbench,
    queue: optimisticQueue,
    approve,
    skip,
  } = useWorkbenchDecisions({
    workbench: workbench ?? null,
    queue,
    send,
  });

  // ── Local UI state ──
  // Capabilities: server-authoritative (fixture URL, screencast state) + client probing
  const capabilities = useWebMcpCapabilities(capture?.url);
  const [portalLoaded, setPortalLoaded] = useState(false);
  // CDP screencast takes priority: when frames arrive, ScreenPlane renders them.
  // LiveDomPortal is the fallback: when no screencast but fixture URL is reachable.
  const hasScreencast = capture !== null;
  const portalActive = !hasScreencast && capabilities.liveDomPortal && portalLoaded;
  const [decisionBurst, setDecisionBurst] = useState<{
    readonly origin: readonly [number, number, number];
    readonly result: DecisionResult;
  } | null>(null);

  // ── Deferred values: non-blocking high-frequency spatial updates ──
  const deferredProbeQueue = useDeferredValue(probeQueue.active);
  const deferredProposalQueue = useDeferredValue(proposalQueue.active);
  const deferredArtifactQueue = useDeferredValue(artifactQueue.active);
  const deferredKnowledgeNodes = useDeferredValue(knowledgeNodes ?? []);

  const activeProbes = deferredProbeQueue.map((item) => item.data);
  const activeProposals = deferredProposalQueue.map((item) => item.data);
  const activeArtifacts = deferredArtifactQueue.map((item) => item.data);

  // ── Callbacks (stable via useCallback) ──
  const handleParticleArrived = useCallback(
    (probeId: string) => probeQueue.retire(probeId),
    [probeQueue],
  );

  const handlePortalLoaded = useCallback(() => setPortalLoaded(true), []);

  const handleApprove3D = useCallback(
    (workItemId: string) => {
      setDecisionBurst({
        origin: burstOriginForElement(activeProbes, pauseContext?.element ?? null, appViewport),
        result: 'approved',
      });
      approve(workItemId);
    },
    [activeProbes, appViewport, approve, pauseContext?.element],
  );

  const handleSkip3D = useCallback(
    (workItemId: string) => {
      setDecisionBurst({
        origin: burstOriginForElement(activeProbes, pauseContext?.element ?? null, appViewport),
        result: 'skipped',
      });
      skip(workItemId);
    },
    [activeProbes, appViewport, pauseContext?.element, skip],
  );

  const handleBurstComplete = useCallback(() => setDecisionBurst(null), []);

  // ── Five-zone render ──
  return (
    <div className="dashboard-layout">

      {/* ─── Zone 1: Presence Bar (top, full width) ─── */}
      <div className="presence-bar">
        <h1>Tesseract</h1>
        <StatusBar
          workbench={optimisticWorkbench}
          scorecard={scorecard ?? null}
          connected={connected}
          progress={progress}
        />
      </div>

      {/* ─── Zone 2: Surface Stage (center-left, dominant) ─── */}
      <div className="surface-stage" role="main" aria-label="Pipeline visualization">
        {/* LiveDomPortal fallback: show AUT iframe when no CDP screencast is available */}
        {!hasScreencast && capabilities.liveDomPortal && capabilities.appUrl && (
          <LiveDomPortal appUrl={capabilities.appUrl} onLoad={handlePortalLoaded} />
        )}
        <PortalLoading visible={!hasScreencast && capabilities.liveDomPortal && !portalLoaded} />

        <SceneErrorBoundary>
          <SpatialCanvas
            probes={activeProbes}
            capture={portalActive ? null : capture}
            viewport={appViewport}
            knowledgeNodes={deferredKnowledgeNodes}
            onParticleArrived={handleParticleArrived}
            portalActive={portalActive}
            proposalEvents={activeProposals}
            artifactEvents={activeArtifacts}
            iterationTick={iterationPulse.tick}
            pauseContext={pauseContext}
            onApprove={handleApprove3D}
            onSkip={handleSkip3D}
            decisionBurst={decisionBurst}
            onBurstComplete={handleBurstComplete}
          />
        </SceneErrorBoundary>

        {probeQueue.buffered > 0 && (
          <div className="buffer-indicator">{probeQueue.buffered} buffered</div>
        )}
        {capabilities.mcpAvailable && <div className="mcp-indicator">MCP</div>}
        {pauseContext !== null && (
          <div className="fiber-paused-indicator" aria-live="polite">
            AWAITING HUMAN
          </div>
        )}
      </div>

      {/* ─── Zone 3: Inspector Drawer (right sidebar) ─── */}
      <div className="inspector-drawer" role="complementary" aria-label="Dashboard inspector">
        <ObservationPanel
          connection={observations.connection}
          error={observations.error}
          currentScreenGroup={observations.currentScreenGroup}
          inboxItems={observations.inboxItems}
          confidenceCrossings={observations.confidenceCrossings}
          escalations={observations.escalations}
        />
        <ConvergencePanel state={convergence.state} />
        <div className="grid">
          <FitnessCard scorecard={scorecard ?? null} />
          <ProgressCard progress={progress} />
        </div>
        <QueueVisualization
          queue={optimisticQueue}
          onApprove={approve}
          onSkip={skip}
        />
        <WorkbenchPanel
          workbench={optimisticWorkbench}
          onApprove={approve}
          onSkip={skip}
        />
        <div className="grid">
          <CompletionsPanel completions={optimisticWorkbench?.completions ?? []} />
        </div>
      </div>

      {/* ─── Zone 4: Storyline Rail (bottom, full width) ─── */}
      <StorylineRail
        stages={stageTracker.stages}
        activeStage={stageTracker.activeStage}
        progress={progress}
        connected={connected}
      />
    </div>
  );
}
