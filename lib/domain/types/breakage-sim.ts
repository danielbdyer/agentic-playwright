// ---------------------------------------------------------------------------
// Domain types: What-Would-Break Simulator (N2.2)
// ---------------------------------------------------------------------------

export type DomChangeKind = 'removed' | 'renamed' | 'relocated' | 'restyled' | 'restructured';

export interface HypotheticalDomChange {
  readonly selector: string;
  readonly changeKind: DomChangeKind;
  readonly description: string;
  readonly affectedScreen: string | null;
}

export type BreakageSeverity = 'will-break' | 'likely-degrade' | 'possibly-affected' | 'unaffected';

export interface BreakagePrediction {
  readonly scenarioId: string;
  readonly stepIndex: number;
  readonly affectedSelector: string;
  readonly changeKind: DomChangeKind;
  readonly severity: BreakageSeverity;
  readonly reason: string;
  readonly fallbackAvailable: boolean;
}

export interface BreakageSimulationResult {
  readonly kind: 'breakage-simulation';
  readonly version: 1;
  readonly changes: readonly HypotheticalDomChange[];
  readonly predictions: readonly BreakagePrediction[];
  readonly summary: BreakageSimSummary;
}

export interface BreakageSimSummary {
  readonly totalScenarios: number;
  readonly affectedScenarios: number;
  readonly willBreak: number;
  readonly likelyDegrade: number;
  readonly possiblyAffected: number;
  readonly unaffected: number;
  readonly riskScore: number;
}
