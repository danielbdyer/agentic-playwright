/**
 * Drift detection types — knowledge diverging from reality.
 *
 * Extracted from execution/types.ts during Phase 2 domain decomposition.
 */
import type { AdoId } from '../kernel/identity';
import type {
  Governance,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
} from '../governance/workflow-types';
import type { StepResolutionGraph } from '../resolution/types';

export interface ResolutionGraphDriftDelta {
  readonly traversalPathChanged: boolean;
  readonly winnerRungChanged: boolean;
  readonly winnerRationaleChanged: boolean;
}

export interface ResolutionGraphStepRecord {
  readonly stepIndex: number;
  readonly graph: StepResolutionGraph;
}

export interface ResolutionGraphRecord {
  readonly kind: 'resolution-graph-record';
  readonly version: 1;
  readonly stage: 'resolution';
  readonly scope: 'run';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly adoId: AdoId;
  readonly runId: string;
  readonly providerId: string;
  readonly mode: string;
  readonly generatedAt: string;
  readonly steps: readonly ResolutionGraphStepRecord[];
}

export interface InterpretationDriftChange {
  readonly field: 'winningSource' | 'target' | 'governance' | 'confidence' | 'exhaustion-path' | 'resolution-graph';
  readonly before: unknown;
  readonly after: unknown;
}

export interface InterpretationDriftStep {
  readonly stepIndex: number;
  readonly changed: boolean;
  readonly changes: readonly InterpretationDriftChange[];
  readonly before: {
    readonly winningSource: string;
    readonly target: string;
    readonly governance: Governance;
    readonly confidence: string;
    readonly exhaustionPath: readonly string[];
    readonly resolutionGraphDigest: string;
  };
  readonly after: {
    readonly winningSource: string;
    readonly target: string;
    readonly governance: Governance;
    readonly confidence: string;
    readonly exhaustionPath: readonly string[];
    readonly resolutionGraphDigest: string;
  };
  readonly resolutionGraphDrift: ResolutionGraphDriftDelta;
}

export interface InterpretationDriftRecord {
  readonly kind: 'interpretation-drift-record';
  readonly version: 1;
  readonly stage: 'resolution';
  readonly scope: 'run';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly adoId: AdoId;
  readonly runId: string;
  readonly comparedRunId: string | null;
  readonly providerId: string;
  readonly mode: string;
  readonly comparedAt: string;
  readonly changedStepCount: number;
  readonly unchangedStepCount: number;
  readonly totalStepCount: number;
  readonly hasDrift: boolean;
  readonly provenance: {
    readonly taskFingerprint: string;
    readonly knowledgeFingerprint: string;
    readonly controlsFingerprint: string | null;
    readonly comparedTaskFingerprint: string | null;
    readonly comparedKnowledgeFingerprint: string | null;
    readonly comparedControlsFingerprint: string | null;
  };
  readonly explainableByFingerprintDelta: boolean;
  readonly steps: readonly InterpretationDriftStep[];
}
