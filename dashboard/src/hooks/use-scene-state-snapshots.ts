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

  useEffect(() => {
    if (!input.enabled) return;
    const now = Date.now();
    const eventBoundary = input.everyNEvents ? input.eventSequence % input.everyNEvents === 0 : false;
    const timeBoundary = input.everyMs ? now - lastSnapshotAtRef.current >= input.everyMs : false;
    if (!eventBoundary && !timeBoundary) return;

    const snapshot: SceneStateSnapshot = {
      sequenceNumber: input.eventSequence,
      timestamp: new Date(now).toISOString(),
      iteration: input.iteration,
      act: input.act,
      knowledgeNodeCount: input.knowledgeNodeCount,
      activeProbeCount: input.activeProbeCount,
      activeProposalCount: input.activeProposalCount,
      activeArtifactCount: input.activeArtifactCount,
      throughputPerSecond: input.throughputPerSecond,
      queueDepthByAct: input.queueDepthByAct,
    };
    setSnapshots((prev) => [...prev, snapshot]);
    lastSnapshotAtRef.current = now;
  }, [input]);

  return { snapshots } as const;
}
