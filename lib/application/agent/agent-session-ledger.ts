import { Effect } from 'effect';
import type { ProposalBundle } from '../../domain/execution/types';
import type { AgentSession } from '../../domain/handshake/session';
import type { TrainingCorpusManifest } from '../../domain/learning/types';
import type { ScenarioInterpretationSurface } from '../../domain/resolution/types';
import type { ApplicationInterfaceGraph, SelectorCanon } from '../../domain/target/interface-graph';
import type { AdoId } from '../../domain/kernel/identity';
import { resolveAgentSessionAdapter } from '../workspace/provider-registry';
import { appendEvent, createInterventionLedger } from '../../domain/aggregates/intervention-ledger';
import {
  agentSessionEventsPath,
  agentSessionPath,
  agentSessionTranscriptRefsPath,
  relativeProjectPath,
  type ProjectPaths,
} from '../paths';
import { InterventionLedgerStore } from '../ports';

export interface AgentSessionLedgerResult {
  session: AgentSession;
  sessionId: string;
  sessionPath: string;
  eventsPath: string;
  transcriptRefsPath: string;
}

function adapterForProvider(providerId: string): string {
  return providerId.includes('copilot') ? 'copilot-vscode-chat' : 'deterministic-agent-session';
}

export function writeAgentSessionLedger(input: {
  paths: ProjectPaths;
  adoId: AdoId;
  runId: string;
  providerId: string;
  executionProfile: AgentSession['executionProfile'];
  startedAt: string;
  completedAt: string | null;
  improvementRunId?: string | undefined;
  surface: ScenarioInterpretationSurface;
  interfaceGraph: ApplicationInterfaceGraph | null;
  selectorCanon: SelectorCanon | null;
  proposalBundle: ProposalBundle | null;
  learningManifest: TrainingCorpusManifest | null;
}) {
  return Effect.gen(function* () {
    const interventionLedgerStore = yield* InterventionLedgerStore;
    const sessionId = `${input.runId}`;
    const adapter = resolveAgentSessionAdapter(adapterForProvider(input.providerId));
    const participants = adapter.participants({
      sessionId,
      providerId: input.providerId,
    });
    const transcripts = adapter.transcriptRefs({
      sessionId,
      adoId: input.adoId,
      runId: input.runId,
    });
    const interventions = adapter.interventionReceipts({
      adoId: input.adoId,
      runId: input.runId,
      sessionId,
      surface: input.surface,
      interfaceGraph: input.interfaceGraph,
      selectorCanon: input.selectorCanon,
      proposalBundle: input.proposalBundle,
      learningManifest: input.learningManifest,
      participants,
    });
    const events = adapter.eventVocabulary({
      adoId: input.adoId,
      runId: input.runId,
      sessionId,
      surface: input.surface,
      interfaceGraph: input.interfaceGraph,
      selectorCanon: input.selectorCanon,
      proposalBundle: input.proposalBundle,
      learningManifest: input.learningManifest,
      participants,
      interventions,
    });
    const sessionSummary = adapter.sessionSummary({
      sessionId,
      providerId: input.providerId,
      executionProfile: input.executionProfile,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      scenarioIds: [input.adoId],
      runIds: [input.runId],
      participants,
      interventions,
      improvementRunIds: input.improvementRunId ? [input.improvementRunId] : [],
      transcripts,
      events,
    });
    const draftLedger = events.reduce(
      (state, event) => appendEvent(state, event),
      createInterventionLedger({ session: sessionSummary }),
    );
    const sessionPath = agentSessionPath(input.paths, sessionId);
    const eventsPath = agentSessionEventsPath(input.paths, sessionId);
    const transcriptRefsPath = agentSessionTranscriptRefsPath(input.paths, sessionId);
    const persistedLedger = yield* Effect.promise(() => interventionLedgerStore.save({
      sessionPath,
      eventsPath,
      transcriptsPath: transcriptRefsPath,
    }, {
      session: draftLedger.session,
      events: draftLedger.events,
      transcripts,
    }));
    const session = persistedLedger.session;
    return {
      session,
      sessionId,
      sessionPath: relativeProjectPath(input.paths, sessionPath),
      eventsPath: relativeProjectPath(input.paths, eventsPath),
      transcriptRefsPath: relativeProjectPath(input.paths, transcriptRefsPath),
    } satisfies AgentSessionLedgerResult;
  });
}
