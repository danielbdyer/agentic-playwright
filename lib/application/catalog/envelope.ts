import { taggedContentFingerprint } from '../../domain/kernel/hash';
import type { AdoId } from '../../domain/kernel/identity';
import type { ProposalBundle, RunRecord, ScenarioRunStep } from '../../domain/execution/types';
import type {
  Governance,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
} from '../../domain/governance/workflow-types';
import { mintApproved } from '../../domain/governance/workflow-types';
import { GovernanceLattice, meetAll } from '../../domain/algebra/lattice';
import type { BoundScenario } from '../../domain/intent/types';
import type { ProjectPaths } from '../paths';
import { relativeProjectPath } from '../paths';
import type { ArtifactEnvelope } from './types';

export function fingerprintArtifact(artifact: unknown): string {
  return taggedContentFingerprint(artifact);
}

export function createArtifactEnvelope<T>(paths: ProjectPaths, absolutePath: string, artifact: T): ArtifactEnvelope<T> {
  return {
    artifact,
    absolutePath,
    artifactPath: relativeProjectPath(paths, absolutePath),
    fingerprint: fingerprintArtifact(artifact),
  };
}

export function upsertArtifactEnvelope<T>(
  entries: ArtifactEnvelope<T>[],
  entry: ArtifactEnvelope<T>,
  matches: (candidate: ArtifactEnvelope<T>) => boolean,
): ArtifactEnvelope<T>[] {
  return [...entries.filter((candidate) => !matches(candidate)), entry]
    .sort((left, right) => left.artifactPath.localeCompare(right.artifactPath));
}

export function createScenarioEnvelopeIds(input: {
  adoId: AdoId;
  suite: string;
  runId: string;
  dataset?: string | null | undefined;
  runbook?: string | null | undefined;
  resolutionControl?: string | null | undefined;
}): WorkflowEnvelopeIds {
  return {
    adoId: input.adoId,
    suite: input.suite,
    runId: input.runId,
    dataset: input.dataset ?? null,
    runbook: input.runbook ?? null,
    resolutionControl: input.resolutionControl ?? null,
  };
}

export function createScenarioEnvelopeFingerprints(input: {
  artifact: string;
  content: string;
  knowledge?: string | null | undefined;
  controls?: string | null | undefined;
  task?: string | null | undefined;
  run?: string | null | undefined;
}): WorkflowEnvelopeFingerprints {
  return {
    artifact: input.artifact,
    content: input.content,
    knowledge: input.knowledge ?? null,
    controls: input.controls ?? null,
    task: input.task ?? null,
    run: input.run ?? null,
  };
}

export function createEnvelopeLineage(input: {
  taskFingerprint: string;
  runbookArtifactPath?: string | null | undefined;
  datasetArtifactPath?: string | null | undefined;
  parents: string[];
  handshakes: WorkflowEnvelopeLineage['handshakes'];
}): WorkflowEnvelopeLineage {
  return {
    sources: [
      input.taskFingerprint,
      ...(input.runbookArtifactPath ? [input.runbookArtifactPath] : []),
      ...(input.datasetArtifactPath ? [input.datasetArtifactPath] : []),
    ],
    parents: input.parents,
    handshakes: input.handshakes,
  };
}

/**
 * Derive aggregate governance from boolean flags.
 * Implemented as a lattice meet: start with top (approved), meet with
 * each observed governance state. This is equivalent to the prior
 * if/else chain but uses the algebraic structure.
 */
export function deriveGovernanceState(input: {
  hasBlocked: boolean;
  hasReviewRequired: boolean;
}): Governance {
  const { meet } = GovernanceLattice;
  const base: Governance = 'approved';
  const afterBlocked = input.hasBlocked ? meet(base, 'blocked') : base;
  return input.hasReviewRequired ? meet(afterBlocked, 'review-required') : afterBlocked;
}

/** Fold an array of governance values to the most restrictive (lattice meet).
 *  Thin alias for `meetAll(GovernanceLattice, values)`. Retained as a
 *  named export so call sites read more clearly than a generic
 *  `meetAll` invocation in a governance-specific context. */
export function mergeGovernanceValues(values: readonly Governance[]): Governance {
  return meetAll(GovernanceLattice, values);
}

// ─── Scenario envelope header helper ─────────────────────────────
//
// Both `createRunRecordEnvelope` and `createProposalBundleEnvelope`
// need the same trio — `ids`, `fingerprints`, `lineage` — built
// from a scenario plan's context (ado id, suite, run id, control
// selection, fingerprints, artifact paths). Each of the four call
// sites that used to build these from scratch (build-run-record,
// build-proposals, two fallbacks in emit.ts) would repeat ~17
// field assignments across three helper calls.
//
// `mintScenarioEnvelopeHeader` collapses the three helper calls
// into one. The caller supplies the shared scenario context once
// plus the per-envelope specific bits (artifact fingerprint,
// parents, handshakes) that actually differ between run records
// and proposal bundles. This is the scenario-stage equivalent of
// `mintAtom` / `mintComposition`: one place to read the envelope
// construction rule, automatic consistency across every site that
// builds a scenario-run or proposal-bundle envelope.

export interface ScenarioEnvelopeHeaderInput {
  readonly adoId: AdoId;
  readonly suite: string;
  readonly runId: string;
  readonly dataset?: string | null;
  readonly runbook?: string | null;
  readonly resolutionControl?: string | null;
  readonly contentHash: string;
  readonly knowledgeFingerprint?: string | null;
  readonly controlsFingerprint?: string | null;
  readonly surfaceFingerprint?: string | null;
  readonly runbookArtifactPath?: string | null;
  readonly datasetArtifactPath?: string | null;
  readonly artifactFingerprint: string;
  readonly parents: readonly string[];
  readonly handshakes: WorkflowEnvelopeLineage['handshakes'];
}

export interface ScenarioEnvelopeHeader {
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
}

/** Mint the shared envelope header trio (ids, fingerprints,
 *  lineage) for a scenario-stage workflow envelope. Used by every
 *  call site that builds a RunRecord or ProposalBundle. When
 *  `surfaceFingerprint` is absent the lineage is empty — matches
 *  the emit.ts fallback shape. */
export function mintScenarioEnvelopeHeader(
  input: ScenarioEnvelopeHeaderInput,
): ScenarioEnvelopeHeader {
  return {
    ids: createScenarioEnvelopeIds({
      adoId: input.adoId,
      suite: input.suite,
      runId: input.runId,
      dataset: input.dataset ?? null,
      runbook: input.runbook ?? null,
      resolutionControl: input.resolutionControl ?? null,
    }),
    fingerprints: createScenarioEnvelopeFingerprints({
      artifact: input.artifactFingerprint,
      content: input.contentHash,
      knowledge: input.knowledgeFingerprint ?? null,
      controls: input.controlsFingerprint ?? null,
      task: input.surfaceFingerprint ?? null,
      run: input.runId,
    }),
    lineage: input.surfaceFingerprint
      ? createEnvelopeLineage({
          taskFingerprint: input.surfaceFingerprint,
          runbookArtifactPath: input.runbookArtifactPath ?? null,
          datasetArtifactPath: input.datasetArtifactPath ?? null,
          parents: [...input.parents],
          handshakes: input.handshakes,
        })
      : {
          sources: [],
          parents: [...input.parents],
          handshakes: input.handshakes,
        },
  };
}

/** Build an empty placeholder `ProposalBundle` envelope for a
 *  bound scenario with no live proposals — the "no changes to
 *  propose" shape used by the emit.ts fallbacks when a scenario
 *  has no run record with proposals. Previously duplicated
 *  verbatim at two call sites in `emit.ts`. */
export function emptyProposalBundleForBound(input: {
  readonly boundScenario: BoundScenario;
  readonly runId: string;
}): ProposalBundle {
  const header = mintScenarioEnvelopeHeader({
    adoId: input.boundScenario.source.ado_id,
    suite: input.boundScenario.metadata.suite,
    runId: input.runId,
    contentHash: input.boundScenario.source.content_hash,
    artifactFingerprint: input.runId,
    parents: [],
    handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
  });
  return createProposalBundleEnvelope({
    ids: header.ids,
    fingerprints: header.fingerprints,
    lineage: header.lineage,
    governance: mintApproved(),
    payload: {
      adoId: input.boundScenario.source.ado_id,
      runId: input.runId,
      revision: input.boundScenario.source.revision,
      title: input.boundScenario.metadata.title,
      suite: input.boundScenario.metadata.suite,
      proposals: [],
    },
    proposals: [],
  });
}

export function createRunRecordEnvelope(input: {
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  payload: RunRecord['payload'];
  steps: readonly ScenarioRunStep[];
  evidenceIds: readonly string[];
  governance: Governance;
}): RunRecord {
  return {
    kind: 'scenario-run-record',
    version: 1,
    stage: 'execution',
    scope: 'run',
    ids: input.ids,
    fingerprints: input.fingerprints,
    lineage: input.lineage,
    governance: input.governance,
    payload: {
      ...input.payload,
      steps: input.steps,
      evidenceIds: input.evidenceIds,
      translationMetrics: input.payload.translationMetrics,
      executionMetrics: input.payload.executionMetrics,
    },
    runId: input.payload.runId,
    adoId: input.payload.adoId,
    revision: input.payload.revision,
    title: input.payload.title,
    suite: input.payload.suite,
    taskFingerprint: input.payload.taskFingerprint,
    knowledgeFingerprint: input.payload.knowledgeFingerprint,
    provider: input.payload.provider,
    mode: input.payload.mode,
    startedAt: input.payload.startedAt,
    completedAt: input.payload.completedAt,
    steps: input.steps,
    evidenceIds: input.evidenceIds,
    translationMetrics: input.payload.translationMetrics,
    executionMetrics: input.payload.executionMetrics,
  };
}

export function createProposalBundleEnvelope(input: {
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  payload: ProposalBundle['payload'];
  proposals: ProposalBundle['payload']['proposals'];
  governance: Governance;
}): ProposalBundle {
  return {
    kind: 'proposal-bundle',
    version: 1,
    stage: 'proposal',
    scope: 'scenario',
    ids: input.ids,
    fingerprints: input.fingerprints,
    lineage: input.lineage,
    governance: input.governance,
    payload: {
      ...input.payload,
      proposals: input.proposals,
    },
  };
}
