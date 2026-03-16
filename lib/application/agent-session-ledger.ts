import { Effect } from 'effect';
import type {
  AgentSession,
  ApplicationInterfaceGraph,
  ProposalBundle,
  ScenarioInterpretationSurface,
  SelectorCanon,
  TrainingCorpusManifest,
} from '../domain/types';
import type { AdoId } from '../domain/identity';
import { resolveAgentSessionAdapter } from './provider-registry';
import {
  agentSessionEventsPath,
  agentSessionPath,
  agentSessionTranscriptRefsPath,
  relativeProjectPath,
  type ProjectPaths,
} from './paths';
import { FileSystem } from './ports';

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
  surface: ScenarioInterpretationSurface;
  interfaceGraph: ApplicationInterfaceGraph | null;
  selectorCanon: SelectorCanon | null;
  proposalBundle: ProposalBundle | null;
  learningManifest: TrainingCorpusManifest | null;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const sessionId = `${input.runId}`;
    const adapter = resolveAgentSessionAdapter(adapterForProvider(input.providerId));
    const transcripts = adapter.transcriptRefs({
      sessionId,
      adoId: input.adoId,
      runId: input.runId,
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
    });
    const session = adapter.sessionSummary({
      sessionId,
      providerId: input.providerId,
      executionProfile: input.executionProfile,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      scenarioIds: [input.adoId],
      runIds: [input.runId],
      transcripts,
      events,
    });
    const sessionPath = agentSessionPath(input.paths, sessionId);
    const eventsPath = agentSessionEventsPath(input.paths, sessionId);
    const transcriptRefsPath = agentSessionTranscriptRefsPath(input.paths, sessionId);
    yield* fs.writeJson(sessionPath, session);
    yield* fs.writeText(eventsPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
    yield* fs.writeJson(transcriptRefsPath, transcripts);
    return {
      session,
      sessionId,
      sessionPath: relativeProjectPath(input.paths, sessionPath),
      eventsPath: relativeProjectPath(input.paths, eventsPath),
      transcriptRefsPath: relativeProjectPath(input.paths, transcriptRefsPath),
    } satisfies AgentSessionLedgerResult;
  });
}
