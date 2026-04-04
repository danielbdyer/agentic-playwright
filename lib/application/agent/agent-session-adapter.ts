import type {
  AgentEvent,
  AgentSession,
  ApplicationInterfaceGraph,
  InterventionReceipt,
  Participant,
  ParticipantRef,
  ProposalBundle,
  ScenarioInterpretationSurface,
  SelectorCanon,
  TrainingCorpusManifest,
  TranscriptRef,
} from '../../domain/types';
import { mintApproved } from '../../domain/types/shared-context';
import type { AdoId } from '../../domain/kernel/identity';
import { TesseractError } from '../../domain/kernel/errors';

export type AgentSessionAdapterId = string;

export interface AgentSessionAdapter {
  id: AgentSessionAdapterId;
  host: 'deterministic' | 'copilot-vscode-chat';
  participants(input: {
    sessionId: string;
    providerId?: string | null | undefined;
  }): Participant[];
  transcriptRefs(input: {
    sessionId: string;
    adoId: AdoId;
    runId: string;
  }): TranscriptRef[];
  interventionReceipts(input: {
    adoId: AdoId;
    runId: string;
    sessionId: string;
    surface: ScenarioInterpretationSurface;
    interfaceGraph: ApplicationInterfaceGraph | null;
    selectorCanon: SelectorCanon | null;
    proposalBundle: ProposalBundle | null;
    learningManifest: TrainingCorpusManifest | null;
    participants?: readonly Participant[] | undefined;
  }): InterventionReceipt[];
  eventVocabulary(input: {
    adoId: AdoId;
    runId: string;
    sessionId: string;
    surface: ScenarioInterpretationSurface;
    interfaceGraph: ApplicationInterfaceGraph | null;
    selectorCanon: SelectorCanon | null;
    proposalBundle: ProposalBundle | null;
    learningManifest: TrainingCorpusManifest | null;
    participants?: readonly Participant[] | undefined;
    interventions?: readonly InterventionReceipt[] | undefined;
  }): AgentEvent[];
  sessionSummary(input: {
    sessionId: string;
    providerId: string;
    executionProfile: AgentSession['executionProfile'];
    startedAt: string;
    completedAt: string | null;
    scenarioIds: AdoId[];
    runIds: string[];
    participants?: readonly Participant[] | undefined;
    interventions?: readonly InterventionReceipt[] | undefined;
    improvementRunIds?: readonly string[] | undefined;
    transcripts: TranscriptRef[];
    events: AgentEvent[];
  }): AgentSession;
}

const ALL_EVENT_TYPES: readonly AgentEvent['type'][] = [
  'orientation',
  'artifact-inspection',
  'discovery-request',
  'observation-recorded',
  'spec-fragment-proposed',
  'proposal-approved',
  'proposal-rejected',
  'rerun-requested',
  'execution-reviewed',
  'benchmark-action',
  'replay-action',
] as const;

function summarizeEvents(events: AgentEvent[]): AgentSession['eventTypes'] {
  const counts = Object.fromEntries(ALL_EVENT_TYPES.map((type) => [type, 0])) as Record<AgentEvent['type'], number>;
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }
  return counts;
}

function participantRef(participant: Participant | undefined): ParticipantRef[] {
  return participant ? [{ participantId: participant.participantId, kind: participant.kind }] : [];
}

function findParticipant(
  participants: readonly Participant[],
  kind: Participant['kind'],
): Participant | undefined {
  return participants.find((participant) => participant.kind === kind);
}

function baseParticipants(input: {
  sessionId: string;
  providerId?: string | null | undefined;
  adapterId: AgentSessionAdapterId;
  host: AgentSessionAdapter['host'];
}): Participant[] {
  return [
    {
      participantId: `${input.sessionId}:system`,
      kind: 'system',
      label: 'Tesseract orchestration',
      providerId: 'tesseract',
      adapterId: null,
      capabilities: ['orient-workspace', 'review-execution'],
      metadata: {
        host: input.host,
      },
    },
    {
      participantId: `${input.sessionId}:agent`,
      kind: 'agent',
      label: input.host === 'copilot-vscode-chat' ? 'Copilot workbench agent' : 'Deterministic workbench agent',
      providerId: input.providerId ?? input.host,
      adapterId: input.adapterId,
      capabilities: ['inspect-artifacts', 'review-execution', 'propose-fragments'],
      metadata: {
        host: input.host,
      },
    },
  ];
}

function sessionIds(input: {
  adoId: AdoId;
  runId: string;
  sessionId: string;
  surface: ScenarioInterpretationSurface;
  participantIds: readonly string[];
  interventionId: string;
}): NonNullable<AgentEvent['ids']> {
  return {
    adoId: input.adoId,
    runId: input.runId,
    sessionId: input.sessionId,
    suite: input.surface.ids.suite ?? null,
    dataset: input.surface.ids.dataset ?? null,
    runbook: input.surface.ids.runbook ?? null,
    resolutionControl: input.surface.ids.resolutionControl ?? null,
    stepIndex: null,
    participantIds: input.participantIds,
    interventionIds: [input.interventionId],
    improvementRunId: null,
    iteration: null,
    parentExperimentId: null,
  };
}

function taskArtifactPaths(input: {
  adoId: AdoId;
  interfaceGraph: ApplicationInterfaceGraph | null;
  selectorCanon: SelectorCanon | null;
}): readonly string[] {
  return [
    input.interfaceGraph ? '.tesseract/interface/index.json' : null,
    input.selectorCanon ? '.tesseract/interface/selectors.json' : null,
    `.tesseract/tasks/${input.adoId}.resolution.json`,
  ].filter((value): value is string => Boolean(value));
}

function baseInterventions(input: {
  adoId: AdoId;
  runId: string;
  sessionId: string;
  surface: ScenarioInterpretationSurface;
  interfaceGraph: ApplicationInterfaceGraph | null;
  selectorCanon: SelectorCanon | null;
  proposalBundle: ProposalBundle | null;
  learningManifest: TrainingCorpusManifest | null;
  participants: readonly Participant[];
  host: AgentSessionAdapter['host'];
}): InterventionReceipt[] {
  const artifactPaths = taskArtifactPaths(input);
  const systemParticipant = findParticipant(input.participants, 'system');
  const agentParticipant = findParticipant(input.participants, 'agent');
  const taskFingerprint = input.surface.surfaceFingerprint;
  const orientationId = `${input.sessionId}:orientation`;
  const artifactInspectionId = `${input.sessionId}:artifacts`;
  const executionReviewId = `${input.sessionId}:execution`;

  return [
    {
      interventionId: orientationId,
      kind: 'orientation',
      status: 'completed',
      summary: `Session oriented around ${input.adoId} on ${input.host}.`,
      participantRefs: participantRef(systemParticipant),
      ids: sessionIds({
        adoId: input.adoId,
        runId: input.runId,
        sessionId: input.sessionId,
        surface: input.surface,
        participantIds: systemParticipant ? [systemParticipant.participantId] : [],
        interventionId: orientationId,
      }),
      target: {
        kind: 'scenario',
        ref: input.adoId,
        label: `Scenario ${input.adoId}`,
        ids: {
          adoId: input.adoId,
          suite: input.surface.ids.suite ?? null,
        },
      },
      plan: {
        summary: `Orient the session around scenario ${input.adoId} and its active task packet.`,
        governance: mintApproved(),
        target: {
          kind: 'scenario',
          ref: input.adoId,
          label: `Scenario ${input.adoId}`,
        },
        expectedArtifactPaths: artifactPaths,
      },
      effects: [{
        kind: 'artifact-inspected',
        severity: 'info',
        summary: 'Loaded interpretation surface and interface projections for the session.',
        target: {
          kind: 'artifact',
          ref: `.tesseract/tasks/${input.adoId}.resolution.json`,
          label: `Scenario interpretation surface ${input.adoId}`,
          artifactPath: `.tesseract/tasks/${input.adoId}.resolution.json`,
        },
        artifactPath: `.tesseract/tasks/${input.adoId}.resolution.json`,
        payload: {
          taskFingerprint,
          knowledgeFingerprint: input.surface.payload.knowledgeFingerprint,
        },
      }],
      startedAt: input.learningManifest?.generatedAt ?? input.surface.ids.runId ?? input.runId,
      completedAt: input.learningManifest?.generatedAt ?? input.surface.ids.runId ?? input.runId,
      payload: {
        host: input.host,
        taskFingerprint,
        knowledgeFingerprint: input.surface.payload.knowledgeFingerprint,
      },
    },
    {
      interventionId: artifactInspectionId,
      kind: 'artifact-inspection',
      status: 'completed',
      summary: `Inspected graph-grounded task inputs for ${input.adoId}.`,
      participantRefs: participantRef(agentParticipant),
      ids: sessionIds({
        adoId: input.adoId,
        runId: input.runId,
        sessionId: input.sessionId,
        surface: input.surface,
        participantIds: agentParticipant ? [agentParticipant.participantId] : [],
        interventionId: artifactInspectionId,
      }),
      target: {
        kind: 'scenario',
        ref: input.adoId,
        label: `Scenario ${input.adoId}`,
        ids: {
          adoId: input.adoId,
          suite: input.surface.ids.suite ?? null,
        },
      },
      plan: {
        summary: `Inspect grounded task inputs, graph references, and selector references for scenario ${input.adoId}.`,
        governance: mintApproved(),
        target: {
          kind: 'scenario',
          ref: input.adoId,
          label: `Scenario ${input.adoId}`,
        },
        expectedArtifactPaths: artifactPaths,
      },
      effects: [{
        kind: 'artifact-inspected',
        severity: 'info',
        summary: 'Inspected graph-grounded task packet inputs.',
        target: {
          kind: 'artifact',
          ref: `.tesseract/tasks/${input.adoId}.resolution.json`,
          label: `Scenario interpretation surface ${input.adoId}`,
          artifactPath: `.tesseract/tasks/${input.adoId}.resolution.json`,
        },
        artifactPath: `.tesseract/tasks/${input.adoId}.resolution.json`,
        payload: {
          targetRefCount: input.surface.payload.steps.flatMap((step) => step.grounding?.targetRefs ?? []).length,
          selectorRefCount: input.surface.payload.steps.flatMap((step) => step.grounding?.selectorRefs ?? []).length,
        },
      }],
      startedAt: input.learningManifest?.generatedAt ?? input.runId,
      completedAt: input.learningManifest?.generatedAt ?? input.runId,
      payload: {
        interfaceGraphFingerprint: input.surface.payload.interface.fingerprint ?? null,
        selectorCanonFingerprint: input.surface.payload.selectors.fingerprint ?? null,
        proposalCount: input.proposalBundle?.payload.proposals.length ?? 0,
      },
    },
    {
      interventionId: executionReviewId,
      kind: 'execution-reviewed',
      status: 'completed',
      summary: `Reviewed execution-ready packet and derived learning surfaces for ${input.adoId}.`,
      participantRefs: participantRef(agentParticipant),
      ids: sessionIds({
        adoId: input.adoId,
        runId: input.runId,
        sessionId: input.sessionId,
        surface: input.surface,
        participantIds: agentParticipant ? [agentParticipant.participantId] : [],
        interventionId: executionReviewId,
      }),
      target: {
        kind: 'run',
        ref: input.runId,
        label: `Run ${input.runId}`,
        ids: {
          adoId: input.adoId,
          runId: input.runId,
          suite: input.surface.ids.suite ?? null,
        },
      },
      plan: {
        summary: `Review the execution-ready packet, selector canon, and learning surfaces for run ${input.runId}.`,
        governance: mintApproved(),
        target: {
          kind: 'run',
          ref: input.runId,
          label: `Run ${input.runId}`,
        },
        expectedArtifactPaths: [
          ...artifactPaths,
          ...(input.learningManifest ? ['.tesseract/learning/manifest.json'] : []),
        ],
      },
      effects: [{
        kind: 'execution-reviewed',
        severity: 'info',
        summary: 'Reviewed execution and replay-ready learning surfaces.',
        target: {
          kind: 'run',
          ref: input.runId,
          label: `Run ${input.runId}`,
        },
        payload: {
          learningCorpusCount: input.learningManifest?.corpora.length ?? 0,
          interfaceSelectorCount: input.selectorCanon?.entries.length ?? 0,
        },
      }],
      startedAt: input.runId,
      completedAt: input.runId,
      payload: {
        learningCorpusCount: input.learningManifest?.corpora.length ?? 0,
        interfaceSelectorCount: input.selectorCanon?.entries.length ?? 0,
      },
    },
  ];
}

function baseEvents(input: {
  adoId: AdoId;
  runId: string;
  sessionId: string;
  surface: ScenarioInterpretationSurface;
  interfaceGraph: ApplicationInterfaceGraph | null;
  selectorCanon: SelectorCanon | null;
  proposalBundle: ProposalBundle | null;
  learningManifest: TrainingCorpusManifest | null;
  host: AgentSessionAdapter['host'];
  participants: readonly Participant[];
  interventions: readonly InterventionReceipt[];
}): AgentEvent[] {
  const artifactPaths = taskArtifactPaths(input);
  const interventionById = new Map(input.interventions.map((intervention) => [intervention.interventionId, intervention] as const));

  return [
    {
      version: 1,
      id: `${input.sessionId}:orientation`,
      at: input.learningManifest?.generatedAt ?? input.surface.ids.runId ?? input.runId,
      type: 'orientation',
      interventionId: `${input.sessionId}:orientation`,
      interventionKind: 'orientation',
      actor: 'system',
      summary: `Session oriented around ${input.adoId} on ${input.host}.`,
      ids: interventionById.get(`${input.sessionId}:orientation`)?.ids,
      participantRefs: interventionById.get(`${input.sessionId}:orientation`)?.participantRefs ?? [],
      refs: {
        artifactPaths,
        graphNodeIds: [],
        selectorRefs: [],
        transcriptIds: [],
      },
      payload: {
        host: input.host,
        taskFingerprint: input.surface.surfaceFingerprint,
        knowledgeFingerprint: input.surface.payload.knowledgeFingerprint,
      },
    },
    {
      version: 1,
      id: `${input.sessionId}:artifacts`,
      at: input.learningManifest?.generatedAt ?? input.runId,
      type: 'artifact-inspection',
      interventionId: `${input.sessionId}:artifacts`,
      interventionKind: 'artifact-inspection',
      actor: 'agent',
      summary: `Inspected graph-grounded task inputs for ${input.adoId}.`,
      ids: interventionById.get(`${input.sessionId}:artifacts`)?.ids,
      participantRefs: interventionById.get(`${input.sessionId}:artifacts`)?.participantRefs ?? [],
      refs: {
        artifactPaths,
        graphNodeIds: input.surface.payload.steps.flatMap((step) => (step.grounding?.targetRefs ?? []).map((targetRef) => `target:${targetRef}`)),
        selectorRefs: input.surface.payload.steps.flatMap((step) => step.grounding?.selectorRefs ?? []),
        transcriptIds: [],
      },
      payload: {
        interfaceGraphFingerprint: input.surface.payload.interface.fingerprint ?? null,
        selectorCanonFingerprint: input.surface.payload.selectors.fingerprint ?? null,
        proposalCount: input.proposalBundle?.payload.proposals.length ?? 0,
      },
    },
    {
      version: 1,
      id: `${input.sessionId}:execution`,
      at: input.runId,
      type: 'execution-reviewed',
      interventionId: `${input.sessionId}:execution`,
      interventionKind: 'execution-reviewed',
      actor: 'agent',
      summary: `Reviewed execution-ready packet and derived learning surfaces for ${input.adoId}.`,
      ids: interventionById.get(`${input.sessionId}:execution`)?.ids,
      participantRefs: interventionById.get(`${input.sessionId}:execution`)?.participantRefs ?? [],
      refs: {
        artifactPaths: [
          ...artifactPaths,
          ...(input.learningManifest ? ['.tesseract/learning/manifest.json'] : []),
        ],
        graphNodeIds: [],
        selectorRefs: input.selectorCanon?.entries.slice(0, 12).flatMap((entry) => entry.probes.map((probe) => probe.selectorRef).slice(0, 1)) ?? [],
        transcriptIds: [],
      },
      payload: {
        learningCorpusCount: input.learningManifest?.corpora.length ?? 0,
        interfaceSelectorCount: input.selectorCanon?.entries.length ?? 0,
      },
    },
  ];
}

function deterministicAdapter(): AgentSessionAdapter {
  return {
    id: 'deterministic-agent-session',
    host: 'deterministic',
    participants(input) {
      return baseParticipants({
        sessionId: input.sessionId,
        providerId: input.providerId,
        adapterId: 'deterministic-agent-session',
        host: 'deterministic',
      });
    },
    transcriptRefs() {
      return [{
        id: 'none',
        kind: 'none',
        label: 'No transcript',
        provider: 'deterministic',
        uri: null,
        artifactPath: null,
      }];
    },
    interventionReceipts(input) {
      return baseInterventions({
        ...input,
        participants: input.participants ?? deterministicAdapter().participants({ sessionId: input.sessionId }),
        host: 'deterministic',
      });
    },
    eventVocabulary(input) {
      const participants = input.participants ?? deterministicAdapter().participants({ sessionId: input.sessionId });
      const interventions = input.interventions ?? deterministicAdapter().interventionReceipts({
        ...input,
        participants,
      });
      return baseEvents({ ...input, host: 'deterministic', participants, interventions });
    },
    sessionSummary(input) {
      const participants = [...(input.participants ?? [])];
      const interventions = [...(input.interventions ?? [])];
      return {
        kind: 'agent-session',
        version: 1,
        sessionId: input.sessionId,
        adapterId: 'deterministic-agent-session',
        providerId: input.providerId,
        executionProfile: input.executionProfile,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        scenarioIds: input.scenarioIds,
        runIds: input.runIds,
        participants,
        participantCount: participants.length,
        interventions,
        interventionCount: interventions.length,
        improvementRunIds: [...(input.improvementRunIds ?? [])],
        transcripts: input.transcripts,
        eventCount: input.events.length,
        eventTypes: summarizeEvents(input.events),
      };
    },
  };
}

function copilotAdapter(): AgentSessionAdapter {
  return {
    id: 'copilot-vscode-chat',
    host: 'copilot-vscode-chat',
    participants(input) {
      return baseParticipants({
        sessionId: input.sessionId,
        providerId: input.providerId,
        adapterId: 'copilot-vscode-chat',
        host: 'copilot-vscode-chat',
      });
    },
    transcriptRefs(input) {
      return [{
        id: `${input.sessionId}:copilot`,
        kind: 'copilot-chat',
        label: `Copilot chat ${input.adoId}`,
        provider: 'copilot-vscode-chat',
        uri: `copilot://chat/${input.sessionId}`,
        artifactPath: null,
      }];
    },
    interventionReceipts(input) {
      return baseInterventions({
        ...input,
        participants: input.participants ?? copilotAdapter().participants({ sessionId: input.sessionId }),
        host: 'copilot-vscode-chat',
      });
    },
    eventVocabulary(input) {
      const participants = input.participants ?? copilotAdapter().participants({ sessionId: input.sessionId });
      const interventions = input.interventions ?? copilotAdapter().interventionReceipts({
        ...input,
        participants,
      });
      return baseEvents({ ...input, host: 'copilot-vscode-chat', participants, interventions }).map((event) => ({
        ...event,
        payload: {
          ...event.payload,
          host: 'copilot-vscode-chat',
        },
      }));
    },
    sessionSummary(input) {
      const participants = [...(input.participants ?? [])];
      const interventions = [...(input.interventions ?? [])];
      return {
        kind: 'agent-session',
        version: 1,
        sessionId: input.sessionId,
        adapterId: 'copilot-vscode-chat',
        providerId: input.providerId,
        executionProfile: input.executionProfile,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        scenarioIds: input.scenarioIds,
        runIds: input.runIds,
        participants,
        participantCount: participants.length,
        interventions,
        interventionCount: interventions.length,
        improvementRunIds: [...(input.improvementRunIds ?? [])],
        transcripts: input.transcripts,
        eventCount: input.events.length,
        eventTypes: summarizeEvents(input.events),
      };
    },
  };
}

export function createAgentSessionAdapterRegistry(
  adapters: AgentSessionAdapter[] = [deterministicAdapter(), copilotAdapter()],
): Map<AgentSessionAdapterId, AgentSessionAdapter> {
  return new Map(adapters.map((adapter) => [adapter.id, adapter]));
}

const defaultRegistry = createAgentSessionAdapterRegistry();

export function resolveAgentSessionAdapter(
  adapterId: AgentSessionAdapterId | null | undefined,
  registry?: Map<AgentSessionAdapterId, AgentSessionAdapter>,
): AgentSessionAdapter {
  const selected = adapterId ?? 'deterministic-agent-session';
  const adapter = (registry ?? defaultRegistry).get(selected);
  if (!adapter) {
    throw new TesseractError('invalid-config', `Unknown agent session adapter "${selected}".`);
  }
  return adapter;
}
