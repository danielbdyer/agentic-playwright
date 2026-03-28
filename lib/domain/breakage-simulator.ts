// ---------------------------------------------------------------------------
// Domain: What-Would-Break Simulator (N2.2)
//
// Pure functions that predict which scenarios degrade given hypothetical
// DOM changes.  No side effects, no mutation, no imperative loops.
// ---------------------------------------------------------------------------

import type {
  BreakagePrediction,
  BreakageSimSummary,
  BreakageSimulationResult,
  BreakageSeverity,
  HypotheticalDomChange,
} from './types/breakage-sim';

// ---------------------------------------------------------------------------
// Public binding types consumed by the simulator
// ---------------------------------------------------------------------------

export interface StepBinding {
  readonly stepIndex: number;
  readonly selectors: readonly string[];
  readonly screenId: string | null;
  readonly hasLocatorLadder: boolean;
  readonly locatorRungs: number;
}

export interface ScenarioBinding {
  readonly scenarioId: string;
  readonly steps: readonly StepBinding[];
}

// ---------------------------------------------------------------------------
// Severity classification (pure)
// ---------------------------------------------------------------------------

const classifySeverity = (
  change: HypotheticalDomChange,
  step: StepBinding,
  matchKind: 'exact' | 'partial' | 'screen',
): { readonly severity: BreakageSeverity; readonly reason: string } => {
  if (matchKind === 'exact') {
    const hasFallback = step.hasLocatorLadder && step.locatorRungs > 1;
    if (!hasFallback) {
      return {
        severity: 'will-break',
        reason: `Selector "${change.selector}" exactly matches step ${step.stepIndex} and no fallback locators exist`,
      };
    }
    return step.locatorRungs <= 3
      ? {
          severity: 'likely-degrade',
          reason: `Selector "${change.selector}" exactly matches step ${step.stepIndex}; fallback ladder has only ${step.locatorRungs} rungs`,
        }
      : {
          severity: 'likely-degrade',
          reason: `Selector "${change.selector}" exactly matches step ${step.stepIndex}; fallback ladder available (${step.locatorRungs} rungs)`,
        };
  }

  if (matchKind === 'partial') {
    return {
      severity: 'possibly-affected',
      reason: `Selector "${change.selector}" partially matches a selector in step ${step.stepIndex}`,
    };
  }

  // screen-level
  return {
    severity: 'possibly-affected',
    reason: `Step ${step.stepIndex} operates on screen "${change.affectedScreen}" which is affected by this change`,
  };
};

// ---------------------------------------------------------------------------
// Matching helpers (pure)
// ---------------------------------------------------------------------------

const hasExactMatch = (
  change: HypotheticalDomChange,
  step: StepBinding,
): boolean => step.selectors.some((s) => s === change.selector);

const hasPartialMatch = (
  change: HypotheticalDomChange,
  step: StepBinding,
): boolean =>
  step.selectors.some(
    (s) => s !== change.selector && (s.includes(change.selector) || change.selector.includes(s)),
  );

const hasScreenMatch = (
  change: HypotheticalDomChange,
  step: StepBinding,
): boolean =>
  change.affectedScreen !== null &&
  step.screenId !== null &&
  step.screenId === change.affectedScreen;

type MatchKind = 'exact' | 'partial' | 'screen';

const determineMatchKind = (
  change: HypotheticalDomChange,
  step: StepBinding,
): MatchKind | null =>
  hasExactMatch(change, step)
    ? 'exact'
    : hasPartialMatch(change, step)
      ? 'partial'
      : hasScreenMatch(change, step)
        ? 'screen'
        : null;

// ---------------------------------------------------------------------------
// Prediction for a single (change, step) pair
// ---------------------------------------------------------------------------

const predictForPair = (
  change: HypotheticalDomChange,
  scenarioId: string,
  step: StepBinding,
): BreakagePrediction | null => {
  const matchKind = determineMatchKind(change, step);
  if (matchKind === null) return null;

  const { severity, reason } = classifySeverity(change, step, matchKind);
  const fallbackAvailable = step.hasLocatorLadder && step.locatorRungs > 1;

  return {
    scenarioId,
    stepIndex: step.stepIndex,
    affectedSelector: change.selector,
    changeKind: change.changeKind,
    severity,
    reason,
    fallbackAvailable,
  };
};

// ---------------------------------------------------------------------------
// Core prediction: cross-product of changes × scenario steps
// ---------------------------------------------------------------------------

const collectPredictions = (
  changes: readonly HypotheticalDomChange[],
  scenarios: readonly ScenarioBinding[],
): readonly BreakagePrediction[] =>
  changes.flatMap((change) =>
    scenarios.flatMap((scenario) =>
      scenario.steps.flatMap((step) => {
          const p = predictForPair(change, scenario.scenarioId, step);
          return p !== null ? [p] : [];
        }),
    ),
  );

// ---------------------------------------------------------------------------
// Risk score
// ---------------------------------------------------------------------------

const severityWeight = (severity: BreakageSeverity): number =>
  severity === 'will-break'
    ? 1.0
    : severity === 'likely-degrade'
      ? 0.5
      : severity === 'possibly-affected'
        ? 0.1
        : 0;

export const computeRiskScore = (
  predictions: readonly BreakagePrediction[],
  totalScenarios: number,
): number => {
  if (totalScenarios === 0) return 0;
  const rawScore = predictions.reduce(
    (acc, p) => acc + severityWeight(p.severity),
    0,
  );
  return Math.min(rawScore / totalScenarios, 1.0);
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const countBySeverity = (
  predictions: readonly BreakagePrediction[],
  severity: BreakageSeverity,
): number => predictions.filter((p) => p.severity === severity).length;

const countAffectedScenarios = (
  predictions: readonly BreakagePrediction[],
): number =>
  new Set(
    predictions.flatMap((p) =>
      p.severity !== 'unaffected' ? [p.scenarioId] : [],
    ),
  ).size;

const buildSummary = (
  predictions: readonly BreakagePrediction[],
  totalScenarios: number,
): BreakageSimSummary => ({
  totalScenarios,
  affectedScenarios: countAffectedScenarios(predictions),
  willBreak: countBySeverity(predictions, 'will-break'),
  likelyDegrade: countBySeverity(predictions, 'likely-degrade'),
  possiblyAffected: countBySeverity(predictions, 'possibly-affected'),
  unaffected: countBySeverity(predictions, 'unaffected'),
  riskScore: computeRiskScore(predictions, totalScenarios),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const predictBreakage = (
  changes: readonly HypotheticalDomChange[],
  scenarios: readonly ScenarioBinding[],
): BreakageSimulationResult => {
  const predictions = collectPredictions(changes, scenarios);
  return {
    kind: 'breakage-simulation',
    version: 1,
    changes,
    predictions,
    summary: buildSummary(predictions, scenarios.length),
  };
};
