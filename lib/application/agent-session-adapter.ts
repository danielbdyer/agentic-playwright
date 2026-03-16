import type {
  AgentEvent,
  AgentSession,
  ApplicationInterfaceGraph,
  ProposalBundle,
  ScenarioInterpretationSurface,
  SelectorCanon,
  TrainingCorpusManifest,
  TranscriptRef,
} from '../domain/types';
import type { AdoId } from '../domain/identity';

export type AgentSessionAdapterId = string;

export interface AgentSessionAdapter {
  id: AgentSessionAdapterId;
  host: 'deterministic' | 'copilot-vscode-chat';
  transcriptRefs(input: {
    sessionId: string;
    adoId: AdoId;
    runId: string;
  }): TranscriptRef[];
  eventVocabulary(input: {
    adoId: AdoId;
    runId: string;
    sessionId: string;
    surface: ScenarioInterpretationSurface;
    interfaceGraph: ApplicationInterfaceGraph | null;
    selectorCanon: SelectorCanon | null;
    proposalBundle: ProposalBundle | null;
    learningManifest: TrainingCorpusManifest | null;
  }): AgentEvent[];
  sessionSummary(input: {
    sessionId: string;
    providerId: string;
    executionProfile: AgentSession['executionProfile'];
    startedAt: string;
    completedAt: string | null;
    scenarioIds: AdoId[];
    runIds: string[];
    transcripts: TranscriptRef[];
    events: AgentEvent[];
  }): AgentSession;
}

function summarizeEvents(events: AgentEvent[]): AgentSession['eventTypes'] {
  const counts: Partial<Record<AgentEvent['type'], number>> = {};
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }
  return counts as AgentSession['eventTypes'];
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
}): AgentEvent[] {
  const taskFingerprint = input.surface.surfaceFingerprint;
  const artifactPaths = [
    input.interfaceGraph ? '.tesseract/interface/index.json' : null,
    input.selectorCanon ? '.tesseract/interface/selectors.json' : null,
    '.tesseract/tasks/' + input.adoId + '.resolution.json',
  ].filter((value): value is string => Boolean(value));
  return [
    {
      version: 1,
      id: `${input.sessionId}:orientation`,
      at: input.learningManifest?.generatedAt ?? input.surface.ids.runId ?? input.runId,
      type: 'orientation',
      actor: 'system',
      summary: `Session oriented around ${input.adoId} on ${input.host}.`,
      ids: {
        adoId: input.adoId,
        runId: input.runId,
        suite: input.surface.ids.suite ?? null,
        dataset: input.surface.ids.dataset ?? null,
        runbook: input.surface.ids.runbook ?? null,
        resolutionControl: input.surface.ids.resolutionControl ?? null,
        stepIndex: null,
      },
      refs: {
        artifactPaths,
        graphNodeIds: [],
        selectorRefs: [],
        transcriptIds: [],
      },
      payload: {
        host: input.host,
        taskFingerprint,
        knowledgeFingerprint: input.surface.payload.knowledgeFingerprint,
      },
    },
    {
      version: 1,
      id: `${input.sessionId}:artifacts`,
      at: input.learningManifest?.generatedAt ?? input.runId,
      type: 'artifact-inspection',
      actor: 'agent',
      summary: `Inspected graph-grounded task inputs for ${input.adoId}.`,
      ids: {
        adoId: input.adoId,
        runId: input.runId,
        suite: input.surface.ids.suite ?? null,
        dataset: input.surface.ids.dataset ?? null,
        runbook: input.surface.ids.runbook ?? null,
        resolutionControl: input.surface.ids.resolutionControl ?? null,
        stepIndex: null,
      },
      refs: {
        artifactPaths,
        graphNodeIds: input.surface.payload.steps.flatMap((step) => (step.grounding?.targetRefs ?? []).map((targetRef) => `target:${targetRef}`)),
        selectorRefs: input.surface.payload.steps.flatMap((step) => step.grounding?.selectorRefs ?? []),
        transcriptIds: [],
      },
      payload: {
        interfaceGraphFingerprint: input.surface.payload.interface.fingerprint ?? null,
        selectorCanonFingerprint: input.surface.payload.selectors.fingerprint ?? null,
        proposalCount: input.proposalBundle?.proposals.length ?? 0,
      },
    },
    {
      version: 1,
      id: `${input.sessionId}:execution`,
      at: input.runId,
      type: 'execution-reviewed',
      actor: 'agent',
      summary: `Reviewed execution-ready packet and derived learning surfaces for ${input.adoId}.`,
      ids: {
        adoId: input.adoId,
        runId: input.runId,
        suite: input.surface.ids.suite ?? null,
        dataset: input.surface.ids.dataset ?? null,
        runbook: input.surface.ids.runbook ?? null,
        resolutionControl: input.surface.ids.resolutionControl ?? null,
        stepIndex: null,
      },
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
    eventVocabulary(input) {
      return baseEvents({ ...input, host: 'deterministic' });
    },
    sessionSummary(input) {
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
    eventVocabulary(input) {
      return baseEvents({ ...input, host: 'copilot-vscode-chat' }).map((event) => ({
        ...event,
        payload: {
          ...event.payload,
          host: 'copilot-vscode-chat',
        },
      }));
    },
    sessionSummary(input) {
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
    throw new Error(`Unknown agent session adapter "${selected}".`);
  }
  return adapter;
}
