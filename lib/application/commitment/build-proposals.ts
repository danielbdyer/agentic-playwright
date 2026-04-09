import { proposalIdForEntry } from '../agency/operator';
import { evaluateArtifactPolicy } from '../governance/trust-policy';
import type { LoadedEvidenceRecord } from '../governance/trust-policy';
import type { WorkspaceCatalog } from '../catalog';
import type { AdoId } from '../../domain/kernel/identity';
import type { ProposalBundle } from '../../domain/execution/types';
import type { StepProvenanceKind, TrustPolicyArtifactType } from '../../domain/governance/workflow-types';
import type { ScenarioRunPlan } from '../../domain/resolution/types';
import {
  createProposalBundleEnvelope,
  deriveGovernanceState,
  mintScenarioEnvelopeHeader,
} from '../catalog/envelope';
import type { RuntimeScenarioStepResult } from '../ports';
import type { PersistedEvidenceArtifact } from './persist-evidence';

/**
 * Derive auto-heal class from provenance + artifact type.
 * Pure derivation — no hand-authored mapping table needed.
 */
function deriveAutoHealClass(provenanceKind: StepProvenanceKind, artifactType: TrustPolicyArtifactType): string {
  const prefix = provenanceKind === 'live-exploration' ? 'runtime'
    : provenanceKind === 'agent-interpreted' ? 'agent'
    : provenanceKind === 'approved-knowledge' ? 'knowledge'
    : provenanceKind === 'explicit' ? 'explicit'
    : 'unresolved';
  return `${prefix}-${artifactType}-cutover`;
}

export interface BuildProposalsResult {
  proposalBundle: ProposalBundle;
}

export function buildProposals(input: {
  adoId: AdoId;
  runId: string;
  plan: ScenarioRunPlan;
  surfaceArtifactPath: string;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
  evidenceCatalog: WorkspaceCatalog;
}): BuildProposalsResult {
  const runbookEntry = input.plan.controlSelection.runbook
    ? input.evidenceCatalog.runbooks.find((entry) => entry.artifact.name === input.plan.controlSelection.runbook) ?? null
    : null;
  const datasetEntry = input.plan.controlSelection.dataset
    ? input.evidenceCatalog.datasets.find((entry) => entry.artifact.name === input.plan.controlSelection.dataset) ?? null
    : null;
  const _activeRunbook = runbookEntry?.artifact ?? null;
  const _activeDataset = datasetEntry?.artifact ?? null;
  const proposalBundleIdentity = {
    payload: { adoId: input.adoId, suite: input.plan.suite },
  } as const;
  const loadedEvidence: LoadedEvidenceRecord[] = input.evidenceCatalog.evidenceRecords.map((entry) => ({
    artifactPath: entry.artifactPath,
    record: entry.artifact,
  })).concat(input.evidenceWrites.map((entry) => ({
    artifactPath: entry.artifactPath,
    record: {
      evidence: {
        type: 'runtime-resolution-gap',
        timestamp: input.stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
        trigger: 'live-dom-resolution',
        observation: {},
        proposal: {
          file: '',
          field: '',
          old_value: null,
          new_value: null,
        },
        confidence: 0.9,
        risk: 'low',
        scope: 'hints',
      },
    },
  })));

  const evidenceByStep = input.evidenceWrites.reduce(
    (acc, entry) => acc.set(entry.stepIndex, [...(acc.get(entry.stepIndex) ?? []), entry.artifactPath]),
    new Map<number, string[]>(),
  );

  const proposals = input.stepResults.flatMap((step) =>
    step.interpretation.proposalDrafts.map((proposal) => {
      const stepEvidenceIds = evidenceByStep.get(step.interpretation.stepIndex) ?? [];
      const proposalEntry = {
        proposalId: '',
        stepIndex: step.interpretation.stepIndex,
        artifactType: proposal.artifactType,
        category: proposal.category ?? null,
        targetPath: proposal.targetPath,
        title: proposal.title,
        patch: proposal.patch,
        enrichment: proposal.enrichment ?? null,
        evidenceIds: stepEvidenceIds,
        impactedSteps: [step.interpretation.stepIndex],
        trustPolicy: evaluateArtifactPolicy({
          policy: input.evidenceCatalog.trustPolicy.artifact,
          proposedChange: {
            artifactType: proposal.artifactType,
            confidence: step.interpretation.provenanceKind === 'live-exploration' ? 0.95 : 0.85,
            autoHealClass: deriveAutoHealClass(step.interpretation.provenanceKind, proposal.artifactType),
          },
          evidence: loadedEvidence,
        }),
        certification: 'uncertified' as const,
        activation: {
          status: 'pending' as const,
          activatedAt: null,
          certifiedAt: null,
          reason: null,
        },
        lineage: {
          runIds: [input.runId],
          evidenceIds: stepEvidenceIds,
          sourceArtifactPaths: [
            input.surfaceArtifactPath,
            ...(runbookEntry ? [runbookEntry.artifactPath] : []),
            ...(datasetEntry ? [datasetEntry.artifactPath] : []),
          ],
          role: null,
          state: null,
          driftSeed: null,
        },
      };
      proposalEntry.proposalId = proposalIdForEntry(proposalBundleIdentity, proposalEntry);
      return proposalEntry;
    }),
  );

  const header = mintScenarioEnvelopeHeader({
    adoId: input.adoId,
    suite: input.plan.suite,
    runId: input.runId,
    dataset: input.plan.controlSelection.dataset,
    runbook: input.plan.controlSelection.runbook,
    resolutionControl: input.plan.controlSelection.resolutionControl,
    contentHash: input.plan.context.contentHash,
    knowledgeFingerprint: input.plan.resolutionContext.knowledgeFingerprint,
    controlsFingerprint: input.plan.controlsFingerprint,
    surfaceFingerprint: input.plan.surfaceFingerprint,
    runbookArtifactPath: input.plan.controlArtifactPaths.runbook ?? null,
    datasetArtifactPath: input.plan.controlArtifactPaths.dataset ?? null,
    artifactFingerprint: `${input.runId}:proposal`,
    parents: [input.plan.surfaceFingerprint, input.runId],
    handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
  });

  const proposalBundle = createProposalBundleEnvelope({
    ids: header.ids,
    fingerprints: header.fingerprints,
    lineage: header.lineage,
    governance: deriveGovernanceState({
      hasBlocked: proposals.some((proposal) => proposal.trustPolicy.decision === 'deny'),
      hasReviewRequired: proposals.some((proposal) => proposal.trustPolicy.decision === 'review'),
    }),
    payload: {
      adoId: input.adoId,
      runId: input.runId,
      revision: input.plan.context.revision,
      title: input.plan.title,
      suite: input.plan.suite,
      proposals: [],
    },
    proposals,
  });

  return { proposalBundle };
}
