import { proposalIdForEntry } from '../operator';
import { evaluateArtifactPolicy } from '../trust-policy';
import type { LoadedEvidenceRecord } from '../trust-policy';
import type { WorkspaceCatalog } from '../catalog';
import type { AdoId } from '../../domain/identity';
import type { ProposalBundle } from '../../domain/types';
import {
  createEnvelopeLineage,
  createProposalBundleEnvelope,
  createScenarioEnvelopeFingerprints,
  createScenarioEnvelopeIds,
  deriveGovernanceState,
} from '../catalog/envelope';
import type { RuntimeScenarioStepResult } from '../ports';
import type { PersistedEvidenceArtifact } from './persist-evidence';
import type { SelectedRunContext } from './select-run-context';

export interface BuildProposalsResult {
  proposalBundle: ProposalBundle;
}

export function buildProposals(input: {
  adoId: AdoId;
  runId: string;
  selectedContext: SelectedRunContext;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
  evidenceCatalog: WorkspaceCatalog;
}): BuildProposalsResult {
  const proposalBundleIdentity = {
    adoId: input.adoId,
    suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
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
      };
      proposalEntry.proposalId = proposalIdForEntry(proposalBundleIdentity, proposalEntry);
      return proposalEntry;
    }),
  );

  const proposalBundle = createProposalBundleEnvelope({
    ids: createScenarioEnvelopeIds({
      adoId: input.adoId,
      suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
      runId: input.runId,
      dataset: input.selectedContext.activeDataset?.name,
      runbook: input.selectedContext.activeRunbook?.name,
      resolutionControl: input.selectedContext.activeRunbook?.resolutionControl,
    }),
    fingerprints: createScenarioEnvelopeFingerprints({
      artifact: `${input.runId}:proposal`,
      content: input.selectedContext.scenarioEntry.artifact.source.content_hash,
      knowledge: input.selectedContext.taskPacketEntry.artifact.knowledgeFingerprint,
      controls: input.selectedContext.taskPacketEntry.artifact.fingerprints.controls,
      task: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
      run: input.runId,
    }),
    lineage: createEnvelopeLineage({
      taskFingerprint: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
      runbookArtifactPath: input.selectedContext.activeRunbook?.artifactPath,
      datasetArtifactPath: input.selectedContext.activeDataset?.artifactPath,
      parents: [input.selectedContext.taskPacketEntry.artifact.taskFingerprint, input.runId],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
    }),
    governance: deriveGovernanceState({
      hasBlocked: proposals.some((proposal) => proposal.trustPolicy.decision === 'deny'),
      hasReviewRequired: proposals.some((proposal) => proposal.trustPolicy.decision === 'review'),
    }),
    payload: {
      adoId: input.adoId,
      runId: input.runId,
      revision: input.selectedContext.scenarioEntry.artifact.source.revision,
      title: input.selectedContext.scenarioEntry.artifact.metadata.title,
      suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
      proposals: [],
    },
    proposals,
  });

  return { proposalBundle };
}
