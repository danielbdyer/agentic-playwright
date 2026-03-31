import path from 'path';
import { SchemaError } from '../domain/errors';
import type { AdoId, ScreenId } from '../domain/identity';

export interface ProjectPaths {
  readonly rootDir: string;
  readonly suiteRoot: string;
  readonly postureConfigPath: string;
  readonly adoSyncDir: string;
  readonly snapshotDir: string;
  readonly archiveDir: string;
  readonly manifestPath: string;
  readonly scenariosDir: string;
  readonly benchmarksDir: string;
  readonly controlsDir: string;
  readonly datasetsDir: string;
  readonly resolutionControlsDir: string;
  readonly runbooksDir: string;
  readonly knowledgeDir: string;
  readonly routesDir: string;
  readonly surfacesDir: string;
  readonly patternsDir: string;
  readonly generatedDir: string;
  readonly generatedTypesDir: string;
  readonly tesseractDir: string;
  readonly interfaceDir: string;
  readonly interfaceGraphIndexPath: string;
  readonly selectorCanonPath: string;
  readonly stateGraphPath: string;
  readonly discoveryDir: string;
  readonly boundDir: string;
  readonly tasksDir: string;
  readonly runsDir: string;
  readonly sessionsDir: string;
  readonly learningDir: string;
  readonly learningManifestPath: string;
  readonly inboxDir: string;
  readonly inboxIndexPath: string;
  readonly inboxReportPath: string;
  readonly hotspotIndexPath: string;
  readonly workbenchDir: string;
  readonly workbenchIndexPath: string;
  readonly workbenchCompletionsPath: string;
  readonly benchmarkRunsDir: string;
  readonly evidenceDir: string;
  readonly confidenceDir: string;
  readonly confidenceIndexPath: string;
  readonly graphDir: string;
  readonly graphIndexPath: string;
  readonly mcpCatalogPath: string;
  readonly policyDir: string;
  readonly trustPolicyPath: string;
  readonly approvalsDir: string;
  readonly translationCacheDir: string;
  readonly agentInterpretationCacheDir: string;
  readonly semanticDictionaryDir: string;
  readonly semanticDictionaryIndexPath: string;
}

/**
 * Suite root: where content/training data lives.
 * For dogfood: `{rootDir}/dogfood`
 * For production: the rootDir itself (or a named suite directory).
 *
 * Engine root (rootDir) owns: `.tesseract/`, `lib/generated/`.
 * Suite root owns: `scenarios/`, `knowledge/`, `controls/`, `fixtures/`,
 *   `benchmarks/`, `.ado-sync/`, `generated/`.
 */
export function createProjectPaths(rootDir: string, suiteRoot?: string): ProjectPaths {
  const suite = suiteRoot ?? rootDir;
  return {
    rootDir,
    suiteRoot: suite,
    postureConfigPath: path.join(suite, 'posture.yaml'),
    adoSyncDir: path.join(suite, '.ado-sync'),
    snapshotDir: path.join(suite, '.ado-sync', 'snapshots'),
    archiveDir: path.join(suite, '.ado-sync', 'archive'),
    manifestPath: path.join(suite, '.ado-sync', 'manifest.json'),
    scenariosDir: path.join(suite, 'scenarios'),
    benchmarksDir: path.join(suite, 'benchmarks'),
    controlsDir: path.join(suite, 'controls'),
    datasetsDir: path.join(suite, 'controls', 'datasets'),
    resolutionControlsDir: path.join(suite, 'controls', 'resolution'),
    runbooksDir: path.join(suite, 'controls', 'runbooks'),
    knowledgeDir: path.join(suite, 'knowledge'),
    routesDir: path.join(suite, 'knowledge', 'routes'),
    surfacesDir: path.join(suite, 'knowledge', 'surfaces'),
    patternsDir: path.join(suite, 'knowledge', 'patterns'),
    generatedDir: path.join(suite, 'generated'),
    generatedTypesDir: path.join(rootDir, 'lib', 'generated'),
    tesseractDir: path.join(rootDir, '.tesseract'),
    interfaceDir: path.join(rootDir, '.tesseract', 'interface'),
    interfaceGraphIndexPath: path.join(rootDir, '.tesseract', 'interface', 'index.json'),
    selectorCanonPath: path.join(rootDir, '.tesseract', 'interface', 'selectors.json'),
    stateGraphPath: path.join(rootDir, '.tesseract', 'interface', 'state-graph.json'),
    discoveryDir: path.join(rootDir, '.tesseract', 'discovery'),
    boundDir: path.join(rootDir, '.tesseract', 'bound'),
    tasksDir: path.join(rootDir, '.tesseract', 'tasks'),
    runsDir: path.join(rootDir, '.tesseract', 'runs'),
    sessionsDir: path.join(rootDir, '.tesseract', 'sessions'),
    learningDir: path.join(rootDir, '.tesseract', 'learning'),
    learningManifestPath: path.join(rootDir, '.tesseract', 'learning', 'manifest.json'),
    inboxDir: path.join(rootDir, '.tesseract', 'inbox'),
    inboxIndexPath: path.join(rootDir, '.tesseract', 'inbox', 'index.json'),
    inboxReportPath: path.join(rootDir, 'generated', 'operator', 'inbox.md'),
    workbenchDir: path.join(rootDir, '.tesseract', 'workbench'),
    workbenchIndexPath: path.join(rootDir, '.tesseract', 'workbench', 'index.json'),
    workbenchCompletionsPath: path.join(rootDir, '.tesseract', 'workbench', 'completions.json'),
    hotspotIndexPath: path.join(rootDir, '.tesseract', 'inbox', 'hotspots.json'),
    benchmarkRunsDir: path.join(rootDir, '.tesseract', 'benchmarks'),
    evidenceDir: path.join(rootDir, '.tesseract', 'evidence'),
    confidenceDir: path.join(rootDir, '.tesseract', 'confidence'),
    confidenceIndexPath: path.join(rootDir, '.tesseract', 'confidence', 'index.json'),
    graphDir: path.join(rootDir, '.tesseract', 'graph'),
    graphIndexPath: path.join(rootDir, '.tesseract', 'graph', 'index.json'),
    mcpCatalogPath: path.join(rootDir, '.tesseract', 'graph', 'mcp-catalog.json'),
    policyDir: path.join(rootDir, '.tesseract', 'policy'),
    trustPolicyPath: path.join(rootDir, '.tesseract', 'policy', 'trust-policy.yaml'),
    approvalsDir: path.join(rootDir, '.tesseract', 'policy', 'approvals'),
    translationCacheDir: path.join(rootDir, '.tesseract', 'translation-cache'),
    agentInterpretationCacheDir: path.join(rootDir, '.tesseract', 'agent-interpretation-cache'),
    semanticDictionaryDir: path.join(rootDir, '.tesseract', 'semantic-dictionary'),
    semanticDictionaryIndexPath: path.join(rootDir, '.tesseract', 'semantic-dictionary', 'index.json'),
  };
}

function resolvePathWithinRoot(rootDir: string, pathLike: string, valuePath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(resolvedRoot, pathLike);
  const relativeToRoot = path.relative(resolvedRoot, resolvedCandidate);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new SchemaError('resolved path escapes expected root', valuePath);
  }

  return resolvedCandidate;
}

export function snapshotPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.snapshotDir, `${adoId}.json`);
}

export function archiveSnapshotPath(paths: ProjectPaths, adoId: AdoId, revision: number): string {
  return path.join(paths.archiveDir, adoId, `${revision}.json`);
}

export function scenarioPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.scenariosDir, path.join(suitePath, `${adoId}.scenario.yaml`), 'suitePath');
}

export function boundPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.boundDir, `${adoId}.json`);
}

export function datasetControlPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.datasetsDir, `${name}.dataset.yaml`, 'name');
}

export function benchmarkDefinitionPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.benchmarksDir, `${name}.benchmark.yaml`, 'name');
}

export function resolutionControlPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.resolutionControlsDir, `${name}.resolution.yaml`, 'name');
}

export function runbookPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.runbooksDir, `${name}.runbook.yaml`, 'name');
}

export function taskPacketPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.tasksDir, `${adoId}.resolution.json`);
}

export function runDirPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(paths.runsDir, `${adoId}`, runId);
}

export function agentSessionDirPath(paths: ProjectPaths, sessionId: string): string {
  return resolvePathWithinRoot(paths.sessionsDir, sessionId, 'sessionId');
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
  return resolvePathWithinRoot(paths.learningDir, runtime, 'runtime');
}

export function learningHealthPath(paths: ProjectPaths): string {
  return path.join(paths.learningDir, 'health.json');
}

export function learningEvaluationsDir(paths: ProjectPaths): string {
  return path.join(paths.learningDir, 'evaluations');
}

export function replayEvaluationPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(learningEvaluationsDir(paths), `${adoId}.${runId}.eval.json`);
}

export function replayEvaluationSummaryPath(paths: ProjectPaths): string {
  return path.join(learningEvaluationsDir(paths), 'summary.json');
}

export function learningBottlenecksPath(paths: ProjectPaths): string {
  return path.join(paths.learningDir, 'bottlenecks.json');
}

export function learningRankingsPath(paths: ProjectPaths): string {
  return path.join(paths.learningDir, 'rankings.json');
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

export function generatedSpecPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join(suitePath, `${adoId}.spec.ts`), 'suitePath');
}

export function generatedTracePath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join(suitePath, `${adoId}.trace.json`), 'suitePath');
}

export function generatedReviewPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join(suitePath, `${adoId}.review.md`), 'suitePath');
}

export function generatedProposalsPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join(suitePath, `${adoId}.proposals.json`), 'suitePath');
}

export function emitManifestPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(path.join(paths.tesseractDir, 'emit'), path.join(suitePath, `${adoId}.manifest.json`), 'suitePath');
}

export function approvalReceiptPath(paths: ProjectPaths, proposalId: string): string {
  return resolvePathWithinRoot(paths.approvalsDir, `${proposalId}.approval.json`, 'proposalId');
}

export function rerunPlanPath(paths: ProjectPaths, planId: string): string {
  return resolvePathWithinRoot(paths.inboxDir, `${planId}.rerun-plan.json`, 'planId');
}

export function benchmarkRunDirPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.benchmarkRunsDir, benchmarkName, 'benchmarkName');
}

export function improvementLoopLedgerPath(paths: ProjectPaths): string {
  return resolvePathWithinRoot(paths.runsDir, 'improvement-loop-ledger.json', 'artifact');
}

export function benchmarkImprovementProjectionPath(paths: ProjectPaths, benchmarkName: string, runId: string): string {
  return resolvePathWithinRoot(benchmarkRunDirPath(paths, benchmarkName), `${runId}.benchmark-improvement.json`, 'runId');
}

export function benchmarkDogfoodRunPath(paths: ProjectPaths, benchmarkName: string, runId: string): string {
  return resolvePathWithinRoot(benchmarkRunDirPath(paths, benchmarkName), `${runId}.dogfood-run.json`, 'runId');
}

export function benchmarkScorecardJsonPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.scorecard.json`), 'benchmarkName');
}

export function benchmarkScorecardMarkdownPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.scorecard.md`), 'benchmarkName');
}

export function benchmarkVariantsSpecPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.spec.ts`), 'benchmarkName');
}

export function benchmarkVariantsTracePath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.trace.json`), 'benchmarkName');
}

export function benchmarkVariantsReviewPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.review.md`), 'benchmarkName');
}

export function elementsPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.elements.yaml`);
}

export function posturesPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.postures.yaml`);
}

export function hintsPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.hints.yaml`);
}

export function behaviorPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.behavior.yaml`);
}

export function surfacePath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.surfacesDir, `${screen}.surface.yaml`);
}

export function patternDocumentPath(paths: ProjectPaths, fileName: string): string {
  return path.join(paths.patternsDir, fileName);
}

export function knowledgeArtifactPath(paths: ProjectPaths, relativeArtifactPath: string): string {
  const normalized = relativeArtifactPath.replace(/^knowledge[\\/]/, '');
  return resolvePathWithinRoot(paths.knowledgeDir, normalized, 'relativeArtifactPath');
}

export function generatedKnowledgePath(paths: ProjectPaths): string {
  return path.join(paths.generatedTypesDir, 'tesseract-knowledge.ts');
}

export function agentDslPath(paths: ProjectPaths): string {
  return path.join(paths.generatedTypesDir, 'agent-dsl.ts');
}

export function relativeProjectPath(paths: ProjectPaths, absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  const resolvedSuite = path.resolve(paths.suiteRoot);
  const resolvedRoot = path.resolve(paths.rootDir);
  // Content paths are relative to suite root; engine paths are relative to repo root.
  const base = resolved.startsWith(`${resolvedSuite}${path.sep}`) || resolved === resolvedSuite
    ? resolvedSuite
    : resolvedRoot;
  return path.relative(base, resolved).replace(/\\/g, '/');
}


export function translationCachePath(paths: ProjectPaths, key: string): string {
  return resolvePathWithinRoot(paths.translationCacheDir, `${key}.translation.json`, 'key');
}

export function agentInterpretationCachePath(paths: ProjectPaths, key: string): string {
  return resolvePathWithinRoot(paths.agentInterpretationCacheDir, `${key}.agent-interpretation.json`, 'key');
}
