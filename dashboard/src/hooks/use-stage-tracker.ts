/**
 * useStageTracker — tracks pipeline stage lifecycle as an immutable map.
 *
 * Complexity: O(1) upsert via Map.set, O(s) entries iteration for activeStage
 * where s = number of distinct stages (~6 in practice).
 */

import { useState, useCallback, useMemo } from 'react';
import type { StageLifecycleEvent } from '../spatial/types';

export interface StageState {
  readonly name: string;
  readonly phase: 'idle' | 'active' | 'complete';
  readonly startedAt: number | null;
  readonly durationMs: number | null;
}

export function useStageTracker() {
  const [stages, setStages] = useState<ReadonlyMap<string, StageState>>(new Map());

  const dispatch = useCallback((event: StageLifecycleEvent) => {
    setStages((prev) => {
      const next = new Map(prev);
      const existing = next.get(event.stage);
      next.set(event.stage, event.phase === 'start'
        ? { name: event.stage, phase: 'active', startedAt: Date.now(), durationMs: null }
        : {
            name: event.stage,
            phase: 'complete',
            startedAt: existing?.startedAt ?? null,
            durationMs: event.durationMs ?? null,
          },
      );
      return next;
    });
  }, []);

  const activeStage = useMemo(() => {
    for (const [name, s] of stages) {
      if (s.phase === 'active') return name;
    }
    return null;
  }, [stages]);

  return { stages, activeStage, dispatch } as const;
}
