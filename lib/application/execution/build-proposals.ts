import { proposalIdForEntry } from '../operator';
import { evaluateArtifactPolicy } from '../trust-policy';
import type { LoadedEvidenceRecord } from '../trust-policy';
import type { WorkspaceCatalog } from '../catalog';
import type { AdoId } from '../../domain/identity';
import type { ProposalBundle } from '../../domain/types';
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

  const proposalBundle: ProposalBundle = {
    kind: 'proposal-bundle',
    version: 1,
    stage: 'proposal',
    scope: 'scenario',
    ids: {
      adoId: input.adoId,
      suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
      runId: input.runId,
      dataset: input.selectedContext.activeDataset?.name ?? null,
      runbook: input.selectedContext.activeRunbook?.name ?? null,
      resolutionControl: input.selectedContext.activeRunbook?.resolutionControl ?? null,
    },
    fingerprints: {
      artifact: input.runId,
      content: input.selectedContext.scenarioEntry.artifact.source.content_hash,
      knowledge: input.selectedContext.taskPacketEntry.artifact.knowledgeFingerprint,
      controls: input.selectedContext.taskPacketEntry.artifact.fingerprints.controls ?? null,
      task: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
      run: input.runId,
    },
    lineage: {
      sources: [
        input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
        ...(input.selectedContext.activeRunbook ? [input.selectedContext.activeRunbook.artifactPath] : []),
        ...(input.selectedContext.activeDataset ? [input.selectedContext.activeDataset.artifactPath] : []),
      ],
      parents: [input.selectedContext.taskPacketEntry.artifact.taskFingerprint, input.runId],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
    },
    governance: 'approved',
    payload: {
      adoId: input.adoId,
      runId: input.runId,
      revision: input.selectedContext.scenarioEntry.artifact.source.revision,
      title: input.selectedContext.scenarioEntry.artifact.metadata.title,
      suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
      proposals: [],
    },
    adoId: input.adoId,
    runId: input.runId,
    revision: input.selectedContext.scenarioEntry.artifact.source.revision,
    title: input.selectedContext.scenarioEntry.artifact.metadata.title,
    suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
    proposals: input.stepResults.flatMap((step) =>
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
    ),
  };

  proposalBundle.governance = proposalBundle.proposals.some((proposal) => proposal.trustPolicy.decision === 'deny')
    ? 'blocked'
    : proposalBundle.proposals.some((proposal) => proposal.trustPolicy.decision === 'review')
      ? 'review-required'
      : 'approved';
  proposalBundle.payload.proposals = proposalBundle.proposals;
  proposalBundle.fingerprints.artifact = `${input.runId}:proposal`;

  return { proposalBundle };
}
