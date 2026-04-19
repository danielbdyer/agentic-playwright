export interface ProgressEventLike {
  readonly phase: string;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly metrics: {
    readonly knowledgeHitRate: number;
    readonly proposalsActivated: number;
    readonly totalSteps: number;
    readonly unresolvedSteps: number;
  } | null;
  readonly convergenceReason: string | null;
  readonly elapsed: number;
  readonly calibration?: {
    readonly weightDrift: number;
    readonly topCorrelation: {
      readonly signal: string;
      readonly strength: number;
    } | null;
  } | null;
}

export interface WorkbenchLike {
  readonly generatedAt: string;
  readonly iteration: number;
  readonly items: readonly unknown[];
  readonly completions: readonly unknown[];
  readonly summary: {
    readonly total: number;
    readonly pending: number;
    readonly completed: number;
    readonly byKind: Readonly<Record<string, number>>;
    readonly topPriority: unknown;
  };
}

export interface ScorecardLike {
  readonly highWaterMark: {
    readonly knowledgeHitRate: number;
    readonly translationPrecision: number;
    readonly convergenceVelocity: number;
    readonly proposalYield: number;
    readonly resolutionByRung?: ReadonlyArray<{
      readonly rung: string;
      readonly wins: number;
      readonly rate: number;
    }>;
  };
}
