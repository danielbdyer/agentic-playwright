/**
 * Rung 8 — LLM-assisted DOM exploration.
 *
 * Sits between structural Rung 7 (live-dom) and semantic Rung 9 (agent-interpreted).
 * The agent combines a DOM snapshot with semantic understanding to resolve elements
 * that structural probing alone cannot disambiguate.
 *
 * All functions are pure — no side effects, no mutation.
 */

// ─── Position constant ──────────────────────────────────────────────────────

/** Position of this rung in the resolution ladder. */
export const RUNG_8_POSITION = 8 as const;

// ─── Configuration ──────────────────────────────────────────────────────────

export interface Rung8Config {
  readonly maxSnapshotLength: number;
  readonly confidenceThreshold: number;
  readonly timeoutMs: number;
}

export function defaultRung8Config(): Rung8Config {
  return {
    maxSnapshotLength: 4096,
    confidenceThreshold: 0.6,
    timeoutMs: 5000,
  };
}

// ─── Result ─────────────────────────────────────────────────────────────────

export interface Rung8Result {
  readonly resolved: boolean;
  readonly selector: string | null;
  readonly confidence: number;
  readonly strategy: string;
  readonly domSignals: readonly string[];
}

// ─── Signal vocabulary ──────────────────────────────────────────────────────

const SIGNAL_EXTRACTORS: ReadonlyArray<{
  readonly name: string;
  readonly test: (snapshot: string, hint: string) => boolean;
}> = [
  {
    name: 'aria-label-match',
    test: (snapshot, hint) => {
      const lower = snapshot.toLowerCase();
      const hintLower = hint.toLowerCase();
      return hintLower.length > 0 && lower.includes(`name="${hintLower}"`)
        || lower.includes(`name: ${hintLower}`);
    },
  },
  {
    name: 'role-match',
    test: (snapshot, hint) => {
      const hintLower = hint.toLowerCase();
      return ['button', 'textbox', 'link', 'checkbox', 'combobox', 'radio', 'tab', 'menu', 'dialog']
        .some((role) => hintLower.includes(role) && snapshot.toLowerCase().includes(`role="${role}"`));
    },
  },
  {
    name: 'text-content-match',
    test: (snapshot, hint) => {
      const hintLower = hint.toLowerCase();
      return hintLower.length > 2 && snapshot.toLowerCase().includes(hintLower);
    },
  },
  {
    name: 'id-attribute-present',
    test: (snapshot, _hint) => /id="[^"]+"/i.test(snapshot),
  },
  {
    name: 'unique-landmark',
    test: (snapshot, _hint) => {
      const landmarks = ['banner', 'navigation', 'main', 'contentinfo', 'complementary'];
      return landmarks.some((l) => snapshot.toLowerCase().includes(l));
    },
  },
  {
    name: 'heading-structure',
    test: (snapshot, _hint) => /heading/i.test(snapshot),
  },
  {
    name: 'form-context',
    test: (snapshot, _hint) => /form|fieldset|legend/i.test(snapshot),
  },
  {
    name: 'data-testid-present',
    test: (snapshot, _hint) => /data-testid="[^"]+"/i.test(snapshot),
  },
];

// ─── Pure functions ─────────────────────────────────────────────────────────

/**
 * Extract structural signals from a DOM snapshot relevant to the target element.
 * Pure function: deterministic output for the same inputs.
 */
export function extractDomSignals(
  ariaSnapshot: string,
  elementHint: string,
): readonly string[] {
  if (ariaSnapshot.length === 0 || elementHint.length === 0) {
    return [];
  }
  return SIGNAL_EXTRACTORS
    .filter((extractor) => extractor.test(ariaSnapshot, elementHint))
    .map((extractor) => extractor.name);
}

/**
 * Compute confidence for Rung 8 resolution based on signal quality.
 * Returns a value in [0, 1]. More matching signals produce higher confidence.
 * Pure function: deterministic output for the same inputs.
 */
export function computeRung8Confidence(
  domSignals: readonly string[],
  elementHint: string,
): number {
  if (domSignals.length === 0 || elementHint.length === 0) {
    return 0;
  }

  // Base confidence from signal count, capped at 1.0
  const signalContribution = Math.min(1, domSignals.length / SIGNAL_EXTRACTORS.length);

  // Weight certain high-value signals more heavily
  const highValueSignals = ['aria-label-match', 'text-content-match', 'role-match'] as const;
  const highValueCount = domSignals.filter((s) =>
    (highValueSignals as readonly string[]).includes(s),
  ).length;
  const highValueBoost = Math.min(0.3, highValueCount * 0.1);

  return Math.min(1, Math.max(0, signalContribution * 0.7 + highValueBoost));
}

/**
 * Check whether Rung 8 resolution can be attempted.
 * Requires a non-null, non-empty snapshot and a non-empty element hint.
 */
export function isRung8Applicable(
  ariaSnapshot: string | null,
  elementHint: string,
): boolean {
  return ariaSnapshot !== null
    && ariaSnapshot.length > 0
    && elementHint.length > 0;
}

/**
 * Attempt Rung 8 resolution by combining DOM snapshot analysis with semantic hints.
 * Pure function — no network calls, no mutation.
 */
export function attemptRung8Resolution(
  ariaSnapshot: string,
  elementHint: string,
  config?: Rung8Config,
): Rung8Result {
  const effectiveConfig = config ?? defaultRung8Config();
  const strategy = 'rung8-llm-dom';

  // Guard: empty snapshot cannot resolve
  if (ariaSnapshot.length === 0) {
    return {
      resolved: false,
      selector: null,
      confidence: 0,
      strategy,
      domSignals: [],
    };
  }

  // Truncate snapshot to configured maximum
  const truncated = ariaSnapshot.length > effectiveConfig.maxSnapshotLength
    ? ariaSnapshot.slice(0, effectiveConfig.maxSnapshotLength)
    : ariaSnapshot;

  const signals = extractDomSignals(truncated, elementHint);
  const confidence = computeRung8Confidence(signals, elementHint);
  const resolved = confidence >= effectiveConfig.confidenceThreshold;

  // Derive a selector hint from signals when confidence is sufficient
  const selector = resolved
    ? `[rung8-resolved="${elementHint}"]`
    : null;

  return {
    resolved,
    selector,
    confidence,
    strategy,
    domSignals: signals,
  };
}
