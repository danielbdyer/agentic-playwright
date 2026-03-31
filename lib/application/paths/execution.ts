import path from 'path';
import type { AdoId } from '../../domain/identity';
import type { ProjectPaths } from './types';
import { resolvePathWithinRoot } from './shared';

export function runDirPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(paths.execution.runsDir, `${adoId}`, runId);
}

export function agentSessionDirPath(paths: ProjectPaths, sessionId: string): string {
  return resolvePathWithinRoot(paths.execution.sessionsDir, sessionId, 'sessionId');
}

export function agentSessionPath(paths: ProjectPaths, sessionId: string): string {
  return path.join(agentSessionDirPath(paths, sessionId), 'session.json');
}

export function agentSessionEventsPath(paths: ProjectPaths, sessionId: string): string {
  return path.join(agentSessionDirPath(paths, sessionId), 'events.jsonl');
}

export function agentSessionTranscriptRefsPath(paths: ProjectPaths, sessionId: string): string {
  return path.join(agentSessionDirPath(paths, sessionId), 'transcripts.json');
}

export function learningRuntimeDirPath(paths: ProjectPaths, runtime: 'decomposition' | 'repair-recovery' | 'workflow' | 'replays'): string {
  return resolvePathWithinRoot(paths.execution.learningDir, runtime, 'runtime');
}

export function learningHealthPath(paths: ProjectPaths): string {
  return path.join(paths.execution.learningDir, 'health.json');
}

export function learningEvaluationsDir(paths: ProjectPaths): string {
  return path.join(paths.execution.learningDir, 'evaluations');
}

export function replayEvaluationPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(learningEvaluationsDir(paths), `${adoId}.${runId}.eval.json`);
}

export function replayEvaluationSummaryPath(paths: ProjectPaths): string {
  return path.join(learningEvaluationsDir(paths), 'summary.json');
}

export function learningBottlenecksPath(paths: ProjectPaths): string {
  return path.join(paths.execution.learningDir, 'bottlenecks.json');
}

export function learningRankingsPath(paths: ProjectPaths): string {
  return path.join(paths.execution.learningDir, 'rankings.json');
}

export function interpretationPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(runDirPath(paths, adoId, runId), 'interpretation.json');
}

export function interpretationDriftPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(runDirPath(paths, adoId, runId), 'interpretation-drift.json');
}

export function executionPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(runDirPath(paths, adoId, runId), 'execution.json');
}

export function resolutionGraphPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(runDirPath(paths, adoId, runId), 'resolution-graph.json');
}

export function runRecordPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(runDirPath(paths, adoId, runId), 'run.json');
}

export function benchmarkRunDirPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.execution.benchmarkRunsDir, benchmarkName, 'benchmarkName');
}

export function improvementLoopLedgerPath(paths: ProjectPaths): string {
  return resolvePathWithinRoot(paths.execution.runsDir, 'improvement-loop-ledger.json', 'artifact');
}

export function benchmarkImprovementProjectionPath(paths: ProjectPaths, benchmarkName: string, runId: string): string {
  return resolvePathWithinRoot(benchmarkRunDirPath(paths, benchmarkName), `${runId}.benchmark-improvement.json`, 'runId');
}

export function benchmarkDogfoodRunPath(paths: ProjectPaths, benchmarkName: string, runId: string): string {
  return resolvePathWithinRoot(benchmarkRunDirPath(paths, benchmarkName), `${runId}.dogfood-run.json`, 'runId');
}
