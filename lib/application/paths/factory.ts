import path from 'path';
import type {
  ControlPaths,
  EnginePaths,
  ExecutionPaths,
  GovernancePaths,
  IntentPaths,
  KnowledgePaths,
  LegacyProjectPathAliases,
  ProjectPaths,
  ResolutionPaths,
} from './types';

function toLegacyPathAliases(
  engine: EnginePaths,
  intent: IntentPaths,
  knowledge: KnowledgePaths,
  control: ControlPaths,
  resolution: ResolutionPaths,
  execution: ExecutionPaths,
  governance: GovernancePaths,
): LegacyProjectPathAliases {
  return {
    rootDir: engine.rootDir,
    suiteRoot: engine.suiteRoot,
    postureConfigPath: engine.postureConfigPath,
    adoSyncDir: intent.adoSyncDir,
    snapshotDir: intent.snapshotDir,
    archiveDir: intent.archiveDir,
    manifestPath: intent.manifestPath,
    scenariosDir: intent.scenariosDir,
    benchmarksDir: intent.benchmarksDir,
    controlsDir: control.controlsDir,
    datasetsDir: control.datasetsDir,
    resolutionControlsDir: control.resolutionControlsDir,
    runbooksDir: control.runbooksDir,
    knowledgeDir: knowledge.knowledgeDir,
    routesDir: knowledge.routesDir,
    surfacesDir: knowledge.surfacesDir,
    patternsDir: knowledge.patternsDir,
    generatedDir: governance.generatedDir,
    generatedTypesDir: engine.generatedTypesDir,
    tesseractDir: engine.tesseractDir,
    interfaceDir: governance.interfaceDir,
    interfaceGraphIndexPath: governance.interfaceGraphIndexPath,
    selectorCanonPath: governance.selectorCanonPath,
    stateGraphPath: governance.stateGraphPath,
    discoveryDir: governance.discoveryDir,
    boundDir: resolution.boundDir,
    tasksDir: resolution.tasksDir,
    runsDir: execution.runsDir,
    sessionsDir: execution.sessionsDir,
    learningDir: execution.learningDir,
    learningManifestPath: execution.learningManifestPath,
    learningStatePath: execution.learningStatePath,
    intelligenceDir: execution.intelligenceDir,
    screenshotDir: execution.screenshotDir,
    screenshotManifestPath: execution.screenshotManifestPath,
    inboxDir: governance.inboxDir,
    inboxIndexPath: governance.inboxIndexPath,
    inboxReportPath: governance.inboxReportPath,
    hotspotIndexPath: governance.hotspotIndexPath,
    workbenchDir: governance.workbenchDir,
    workbenchIndexPath: governance.workbenchIndexPath,
    workbenchCompletionsPath: governance.workbenchCompletionsPath,
    benchmarkRunsDir: execution.benchmarkRunsDir,
    evidenceDir: execution.evidenceDir,
    confidenceDir: execution.confidenceDir,
    confidenceIndexPath: execution.confidenceIndexPath,
    graphDir: governance.graphDir,
    graphIndexPath: governance.graphIndexPath,
    mcpCatalogPath: governance.mcpCatalogPath,
    policyDir: resolution.policyDir,
    trustPolicyPath: governance.trustPolicyPath,
    approvalsDir: resolution.approvalsDir,
    translationCacheDir: engine.translationCacheDir,
    agentInterpretationCacheDir: engine.agentInterpretationCacheDir,
    semanticDictionaryDir: engine.semanticDictionaryDir,
    semanticDictionaryIndexPath: engine.semanticDictionaryIndexPath,
  };
}

export function createProjectPaths(rootDir: string, suiteRoot?: string): ProjectPaths {
  const suite = suiteRoot ?? rootDir;

  const engine: EnginePaths = {
    rootDir,
    suiteRoot: suite,
    postureConfigPath: path.join(suite, 'posture.yaml'),
    tesseractDir: path.join(rootDir, '.tesseract'),
    generatedTypesDir: path.join(rootDir, 'lib', 'generated'),
    translationCacheDir: path.join(rootDir, '.tesseract', 'translation-cache'),
    agentInterpretationCacheDir: path.join(rootDir, '.tesseract', 'agent-interpretation-cache'),
    semanticDictionaryDir: path.join(rootDir, '.tesseract', 'semantic-dictionary'),
    semanticDictionaryIndexPath: path.join(rootDir, '.tesseract', 'semantic-dictionary', 'index.json'),
  };

  const intent: IntentPaths = {
    adoSyncDir: path.join(suite, '.ado-sync'),
    snapshotDir: path.join(suite, '.ado-sync', 'snapshots'),
    archiveDir: path.join(suite, '.ado-sync', 'archive'),
    manifestPath: path.join(suite, '.ado-sync', 'manifest.json'),
    scenariosDir: path.join(suite, 'scenarios'),
    benchmarksDir: path.join(suite, 'benchmarks'),
  };

  const knowledge: KnowledgePaths = {
    knowledgeDir: path.join(suite, 'knowledge'),
    routesDir: path.join(suite, 'knowledge', 'routes'),
    surfacesDir: path.join(suite, 'knowledge', 'surfaces'),
    patternsDir: path.join(suite, 'knowledge', 'patterns'),
  };

  const control: ControlPaths = {
    controlsDir: path.join(suite, 'controls'),
    datasetsDir: path.join(suite, 'controls', 'datasets'),
    resolutionControlsDir: path.join(suite, 'controls', 'resolution'),
    runbooksDir: path.join(suite, 'controls', 'runbooks'),
  };

  const resolution: ResolutionPaths = {
    boundDir: path.join(rootDir, '.tesseract', 'bound'),
    tasksDir: path.join(rootDir, '.tesseract', 'tasks'),
    policyDir: path.join(rootDir, '.tesseract', 'policy'),
    approvalsDir: path.join(rootDir, '.tesseract', 'policy', 'approvals'),
  };

  const execution: ExecutionPaths = {
    runsDir: path.join(rootDir, '.tesseract', 'runs'),
    sessionsDir: path.join(rootDir, '.tesseract', 'sessions'),
    learningDir: path.join(rootDir, '.tesseract', 'learning'),
    learningManifestPath: path.join(rootDir, '.tesseract', 'learning', 'manifest.json'),
    learningStatePath: path.join(rootDir, '.tesseract', 'learning', 'state.json'),
    benchmarkRunsDir: path.join(rootDir, '.tesseract', 'benchmarks'),
    evidenceDir: path.join(rootDir, '.tesseract', 'evidence'),
    confidenceDir: path.join(rootDir, '.tesseract', 'confidence'),
    confidenceIndexPath: path.join(rootDir, '.tesseract', 'confidence', 'index.json'),
    intelligenceDir: path.join(rootDir, '.tesseract', 'intelligence'),
    screenshotDir: path.join(rootDir, '.tesseract', 'evidence', 'screenshots'),
    screenshotManifestPath: path.join(rootDir, '.tesseract', 'evidence', 'screenshots', 'manifest.json'),
  };

  const governance: GovernancePaths = {
    generatedDir: path.join(suite, 'generated'),
    interfaceDir: path.join(rootDir, '.tesseract', 'interface'),
    interfaceGraphIndexPath: path.join(rootDir, '.tesseract', 'interface', 'index.json'),
    selectorCanonPath: path.join(rootDir, '.tesseract', 'interface', 'selectors.json'),
    stateGraphPath: path.join(rootDir, '.tesseract', 'interface', 'state-graph.json'),
    discoveryDir: path.join(rootDir, '.tesseract', 'discovery'),
    inboxDir: path.join(rootDir, '.tesseract', 'inbox'),
    inboxIndexPath: path.join(rootDir, '.tesseract', 'inbox', 'index.json'),
    inboxReportPath: path.join(rootDir, 'generated', 'operator', 'inbox.md'),
    hotspotIndexPath: path.join(rootDir, '.tesseract', 'inbox', 'hotspots.json'),
    workbenchDir: path.join(rootDir, '.tesseract', 'workbench'),
    workbenchIndexPath: path.join(rootDir, '.tesseract', 'workbench', 'index.json'),
    workbenchCompletionsPath: path.join(rootDir, '.tesseract', 'workbench', 'completions.json'),
    graphDir: path.join(rootDir, '.tesseract', 'graph'),
    graphIndexPath: path.join(rootDir, '.tesseract', 'graph', 'index.json'),
    mcpCatalogPath: path.join(rootDir, '.tesseract', 'graph', 'mcp-catalog.json'),
    trustPolicyPath: path.join(rootDir, '.tesseract', 'policy', 'trust-policy.yaml'),
  };

  return {
    engine,
    intent,
    knowledge,
    control,
    resolution,
    execution,
    governance,
    ...toLegacyPathAliases(engine, intent, knowledge, control, resolution, execution, governance),
  };
}
