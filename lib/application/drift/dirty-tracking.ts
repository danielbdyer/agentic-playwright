import { fingerprintFor } from '../../domain/kernel/hash';

// ─── Stage Manifest ───

export interface StageManifest {
  readonly stage: string;
  readonly inputFingerprint: string;
  readonly outputFingerprint: string;
  readonly timestamp: number;
}

// ─── Dirty Tracker ───

export interface DirtyTracker {
  readonly isStale: (stage: string, currentInputFingerprint: string) => boolean;
  readonly record: (manifest: StageManifest) => DirtyTracker;
  readonly manifests: readonly StageManifest[];
}

/**
 * Compute a deterministic SHA-256 fingerprint from a sorted list of input strings.
 * The inputs are stable-stringified and concatenated to guarantee determinism
 * regardless of insertion order within each input.
 */
export function computeStageFingerprint(inputs: readonly string[]): string {
  const sorted = [...inputs].sort((a, b) => a.localeCompare(b));
  return fingerprintFor('stage-input-set', sorted);
}

/**
 * Create an immutable dirty tracker that detects when a pipeline stage's
 * inputs have changed since the last recorded manifest.
 *
 * The tracker is purely functional: `record` returns a new tracker rather
 * than mutating the existing one. This supports cross-projection dependency
 * tracking — e.g. `emit` can check whether `bind` output is still fresh
 * by comparing the bind stage's recorded output fingerprint against the
 * current input fingerprint for emit.
 */
export function createDirtyTracker(priorManifests?: readonly StageManifest[]): DirtyTracker {
  const manifests: readonly StageManifest[] = priorManifests ?? [];

  const latestByStage: ReadonlyMap<string, StageManifest> = manifests.reduce(
    (acc, manifest) => {
      const existing = acc.get(manifest.stage);
      return existing === undefined || manifest.timestamp >= existing.timestamp
        ? new Map([...acc, [manifest.stage, manifest]])
        : acc;
    },
    new Map<string, StageManifest>(),
  );

  const isStale = (stage: string, currentInputFingerprint: string): boolean => {
    const latest = latestByStage.get(stage);
    return latest === undefined || latest.inputFingerprint !== currentInputFingerprint;
  };

  const record = (manifest: StageManifest): DirtyTracker =>
    createDirtyTracker([...manifests, manifest]);

  return { isStale, record, manifests };
}
