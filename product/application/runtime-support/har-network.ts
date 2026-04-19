/**
 * HAR Network Determinism — record/replay network traffic for test isolation.
 *
 * During capture/discovery, records HAR (HTTP Archive) files alongside
 * screen knowledge. During test execution, replays from HAR for instant,
 * deterministic, backend-independent tests.
 *
 * Uses Playwright's built-in `context.routeFromHAR()` which handles both
 * recording (update mode) and replay automatically.
 *
 * All configuration and path resolution functions are pure.
 * Side-effectful Playwright calls are isolated behind the port interface.
 */

import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export type HarNetworkMode = 'live' | 'record' | 'replay';

export interface HarNetworkConfig {
  /** Network mode: live (no interception), record (capture HAR), replay (serve from HAR). Default: live. */
  readonly mode: HarNetworkMode;
  /** Whether to fall back to live network when HAR has no matching entry. Default: true. */
  readonly fallbackToNetwork: boolean;
  /** URL pattern glob for which requests to record/replay. Default: '**' (all). */
  readonly urlPattern: string;
}

export const DEFAULT_HAR_NETWORK_CONFIG: HarNetworkConfig = {
  mode: 'live',
  fallbackToNetwork: true,
  urlPattern: '**',
};

export interface HarArtifactRef {
  readonly screenId: string;
  readonly harPath: string;
  readonly recordedAt: string;
  readonly requestCount: number;
}

export interface HarManifest {
  readonly kind: 'har-manifest';
  readonly version: 1;
  readonly artifacts: readonly HarArtifactRef[];
  readonly updatedAt: string;
}

// ─── Pure path resolution ───────────────────────────────────────────────────

/** Resolve the HAR file path for a given screen ID within the knowledge directory. */
export function harPathForScreen(knowledgeDir: string, screenId: string): string {
  return path.join(knowledgeDir, 'screens', `${screenId}.har`);
}

/** Resolve the HAR manifest path. */
export function harManifestPath(tesseractDir: string): string {
  return path.join(tesseractDir, 'interface', 'har-manifest.json');
}

// ─── Port interface for Playwright HAR operations ───────────────────────────

/**
 * Port for HAR recording/replay on a Playwright browser context.
 * Implementation lives in product/instruments/ — this is the contract only.
 */
export interface HarPort {
  /** Start recording HAR to the given path. Call before navigation. */
  readonly recordHar: (harPath: string, options?: {
    readonly urlPattern?: string;
  }) => Promise<void>;

  /** Start replaying from a HAR file. Call before navigation. */
  readonly replayHar: (harPath: string, options?: {
    readonly urlPattern?: string;
    readonly fallbackToNetwork?: boolean;
  }) => Promise<void>;
}

// ─── Manifest management ────────────────────────────────────────────────────

/** Create a new HAR artifact ref after recording. */
export function createHarArtifactRef(
  screenId: string,
  harPath: string,
  requestCount: number,
): HarArtifactRef {
  return {
    screenId,
    harPath,
    recordedAt: new Date().toISOString(),
    requestCount,
  };
}

/** Add or update a HAR artifact in the manifest. */
export function upsertHarManifest(
  existing: HarManifest | null,
  artifact: HarArtifactRef,
): HarManifest {
  const now = new Date().toISOString();
  const prev = existing?.artifacts ?? [];
  const filtered = prev.filter((a) => a.screenId !== artifact.screenId);
  return {
    kind: 'har-manifest',
    version: 1,
    artifacts: [...filtered, artifact],
    updatedAt: now,
  };
}

/** Look up the HAR artifact for a screen. Returns null if not recorded. */
export function findHarForScreen(
  manifest: HarManifest | null,
  screenId: string,
): HarArtifactRef | null {
  return manifest?.artifacts.find((a) => a.screenId === screenId) ?? null;
}

/**
 * Determine whether HAR should be used for a given screen and config.
 * Pure decision function — no side effects.
 */
export function shouldUseHar(
  config: HarNetworkConfig,
  manifest: HarManifest | null,
  screenId: string,
): { readonly action: 'record' | 'replay' | 'skip'; readonly harPath?: string } {
  if (config.mode === 'live') return { action: 'skip' };

  if (config.mode === 'record') {
    return { action: 'record' };
  }

  // mode === 'replay'
  const artifact = findHarForScreen(manifest, screenId);
  return artifact
    ? { action: 'replay', harPath: artifact.harPath }
    : { action: 'skip' }; // No HAR recorded yet, fall through to live
}
