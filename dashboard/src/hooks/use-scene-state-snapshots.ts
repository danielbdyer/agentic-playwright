import { useEffect, useRef, useState } from 'react';
import type { FlywheelAct, SceneStateSnapshot } from '../types';

interface UseSceneStateSnapshotsInput {
  readonly enabled: boolean;
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly knowledgeNodeCount: number;
  readonly activeProbeCount: number;
  readonly activeProposalCount: number;
  readonly activeArtifactCount: number;
  readonly throughputPerSecond: number;
  readonly queueDepthByAct: Readonly<Record<FlywheelAct, number>>;
  readonly everyNEvents?: number;
  readonly everyMs?: number;
  readonly eventSequence: number;
}

export function useSceneStateSnapshots(input: UseSceneStateSnapshotsInput) {
  const [snapshots, setSnapshots] = useState<readonly SceneStateSnapshot[]>([]);
  const lastSnapshotAtRef = useRef(0);

  // Stable scalar deps — avoids infinite loop from object identity churn on `input`.
  const { enabled, everyNEvents, everyMs, eventSequence, iteration, act,
    knowledgeNodeCount, activeProbeCount, activeProposalCount, activeArtifactCount,
    throughputPerSecond, queueDepthByAct } = input;

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const eventBoundary = everyNEvents ? eventSequence % everyNEvents === 0 : false;
    const timeBoundary = everyMs ? now - lastSnapshotAtRef.current >= everyMs : false;
    if (!eventBoundary && !timeBoundary) return;

    const snapshot: SceneStateSnapshot = {
      sequenceNumber: eventSequence,
      timestamp: new Date(now).toISOString(),
      iteration,
      act,
      knowledgeNodeCount,
      activeProbeCount,
      activeProposalCount,
      activeArtifactCount,
      throughputPerSecond,
      queueDepthByAct,
    };
    setSnapshots((prev) => [...prev, snapshot]);
    lastSnapshotAtRef.current = now;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- scalar deps only to avoid object identity churn
  }, [enabled, everyNEvents, everyMs, eventSequence, iteration, act,
    knowledgeNodeCount, activeProbeCount, activeProposalCount, activeArtifactCount,
    throughputPerSecond]);

  return { snapshots } as const;
}
