/**
 * HydrationVerdict — the harness's declaration of "did this
 * page actually finish hydrating" with a closed-union verdict
 * tag plus per-phase timings.
 *
 * Per `docs/v2-substrate-ladder-plan.d0a-harness-design.md §2,
 * §5`, the external-snapshot harness uses a four-phase compound
 * heuristic plus a validation re-snapshot (§2.7) to decide
 * whether a snapshot represents a stable DOM. Failure is
 * data-carrying, not exceptional — every invocation emits
 * exactly one verdict (L-Harness-Verdict-Total, §8 L1).
 *
 * ## Verdict precedence
 *
 * Worst-wins per §2.6:
 *   navigation-error > load-timeout > observer-unavailable >
 *   mutation-storm > signature-unstable > capture-unstable >
 *   stable-but-framework-confirmed-only > stable
 *
 * Plus two orthogonal ethics verdicts that short-circuit
 * Phase A:
 *   robots-disallowed — robots.txt forbade the user agent
 *   sensitive-content-detected — PII scan triggered post-capture
 *
 * Pure domain. No Effect. No IO.
 */

/** Closed union of every verdict the harness can emit. */
export type HydrationVerdictKind =
  | 'stable'
  | 'stable-but-framework-confirmed-only'
  | 'navigation-error'
  | 'load-timeout'
  | 'observer-unavailable'
  | 'mutation-storm'
  | 'signature-unstable'
  | 'capture-unstable'
  | 'robots-disallowed'
  | 'sensitive-content-detected';

/** Per-phase timing budget. All values in milliseconds.
 *  0 means the phase did not run (because an earlier phase
 *  short-circuited), not that it ran instantaneously. */
export interface HydrationPhaseTimings {
  readonly phaseAms: number;
  readonly phaseBms: number;
  readonly phaseCms: number;
  readonly phaseDms: number;
  readonly phaseEms: number;
}

/** The hydration verdict + diagnostic evidence. Persisted as
 *  part of every SnapshotRecord. */
export interface HydrationVerdict {
  readonly kind: HydrationVerdictKind;
  /** Human-readable diagnostic suitable for CLI stdout and
   *  log review. Must be non-empty. */
  readonly diagnostic: string;
  readonly phaseTimings: HydrationPhaseTimings;
  /** How many times Phase B was re-entered after Phase C
   *  detected signature drift. 0 means C passed first try. */
  readonly phaseBRetries: number;
  /** Total MutationObserver-recorded mutations. Informational. */
  readonly mutationCount: number;
}

/** Exhaustive fold over verdict kinds. Tests that the union is
 *  closed at compile time. */
export function foldHydrationVerdict<R>(
  verdict: HydrationVerdict,
  cases: {
    readonly stable: (v: HydrationVerdict) => R;
    readonly stableButFrameworkConfirmedOnly: (v: HydrationVerdict) => R;
    readonly navigationError: (v: HydrationVerdict) => R;
    readonly loadTimeout: (v: HydrationVerdict) => R;
    readonly observerUnavailable: (v: HydrationVerdict) => R;
    readonly mutationStorm: (v: HydrationVerdict) => R;
    readonly signatureUnstable: (v: HydrationVerdict) => R;
    readonly captureUnstable: (v: HydrationVerdict) => R;
    readonly robotsDisallowed: (v: HydrationVerdict) => R;
    readonly sensitiveContentDetected: (v: HydrationVerdict) => R;
  },
): R {
  switch (verdict.kind) {
    case 'stable':
      return cases.stable(verdict);
    case 'stable-but-framework-confirmed-only':
      return cases.stableButFrameworkConfirmedOnly(verdict);
    case 'navigation-error':
      return cases.navigationError(verdict);
    case 'load-timeout':
      return cases.loadTimeout(verdict);
    case 'observer-unavailable':
      return cases.observerUnavailable(verdict);
    case 'mutation-storm':
      return cases.mutationStorm(verdict);
    case 'signature-unstable':
      return cases.signatureUnstable(verdict);
    case 'capture-unstable':
      return cases.captureUnstable(verdict);
    case 'robots-disallowed':
      return cases.robotsDisallowed(verdict);
    case 'sensitive-content-detected':
      return cases.sensitiveContentDetected(verdict);
  }
}

/** True iff the verdict represents a successful capture
 *  suitable for distillation input. Includes
 *  stable-but-framework-confirmed-only (flagged lower-confidence
 *  but usable). */
export function isCaptureSuccessful(verdict: HydrationVerdict): boolean {
  return (
    verdict.kind === 'stable' ||
    verdict.kind === 'stable-but-framework-confirmed-only'
  );
}
