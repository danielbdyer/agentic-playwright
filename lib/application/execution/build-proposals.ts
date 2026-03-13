import { proposalIdForEntry } from '../operator';
import { evaluateArtifactPolicy } from '../trust-policy';
import type { LoadedEvidenceRecord } from '../trust-policy';
import type { WorkspaceCatalog } from '../catalog';
import type { AdoId } from '../../domain/identity';
import type { ProposalBundle, ScenarioRunPlan } from '../../domain/types';
import {
  createEnvelopeLineage,
  createProposalBundleEnvelope,
  createScenarioEnvelopeFingerprints,
  createScenarioEnvelopeIds,
  deriveGovernanceState,
} from '../catalog/envelope';
import type { RuntimeScenarioStepResult } from '../ports';
import type { PersistedEvidenceArtifact } from './persist-evidence';

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
  const activeRunbook = input.plan.controlSelection.runbook
    ? input.evidenceCatalog.runbooks.find((entry) => entry.artifact.name === input.plan.controlSelection.runbook)?.artifact ?? null
    : null;
  const activeDataset = input.plan.controlSelection.dataset
    ? input.evidenceCatalog.datasets.find((entry) => entry.artifact.name === input.plan.controlSelection.dataset)?.artifact ?? null
    : null;
  const proposalBundleIdentity = {
    adoId: input.adoId,
    suite: input.plan.suite,
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

  const proposals = input.stepResults.flatMap((step) =>
    step.interpretation.proposalDrafts.map((proposal) => {
      const proposalEntry = {
        proposalId: '',
        stepIndex: step.interpretation.stepIndex,
        artifactType: proposal.artifactType,
        targetPath: proposal.targetPath,
        title: proposal.title,
        patch: proposal.patch,
        evidenceIds: input.evidenceWrites
          .filter((entry) => entry.stepIndex === step.interpretation.stepIndex)
          .map((entry) => entry.artifactPath),
        impactedSteps: [step.interpretation.stepIndex],
        trustPolicy: evaluateArtifactPolicy({
          policy: input.evidenceCatalog.trustPolicy.artifact,
          proposedChange: {
            artifactType: proposal.artifactType,
            confidence: 0.9,
            autoHealClass: 'runtime-intent-cutover',
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
          evidenceIds: input.evidenceWrites
            .filter((entry) => entry.stepIndex === step.interpretation.stepIndex)
            .map((entry) => entry.artifactPath),
          sourceArtifactPaths: [
            input.surfaceArtifactPath,
            ...(activeRunbook ? [input.evidenceCatalog.runbooks.find((entry) => entry.artifact.name === activeRunbook.name)?.artifactPath ?? ''] : []),
            ...(activeDataset ? [input.evidenceCatalog.datasets.find((entry) => entry.artifact.name === activeDataset.name)?.artifactPath ?? ''] : []),
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

  const proposalBundle = createProposalBundleEnvelope({
    ids: createScenarioEnvelopeIds({
      adoId: input.adoId,
      suite: input.plan.suite,
      runId: input.runId,
      dataset: input.plan.controlSelection.dataset,
      runbook: input.plan.controlSelection.runbook,
      resolutionControl: input.plan.controlSelection.resolutionControl,
    }),
    fingerprints: createScenarioEnvelopeFingerprints({
      artifact: `${input.runId}:proposal`,
      content: input.plan.context.contentHash,
      knowledge: input.plan.resolutionContext.knowledgeFingerprint,
      controls: input.plan.controlsFingerprint,
      task: input.plan.surfaceFingerprint,
      run: input.runId,
    }),
    lineage: createEnvelopeLineage({
      taskFingerprint: input.plan.surfaceFingerprint,
      parents: [input.plan.surfaceFingerprint, input.runId],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
    }),
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
