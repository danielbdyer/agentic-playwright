export interface EnginePaths {
  readonly rootDir: string;
  readonly suiteRoot: string;
  readonly postureConfigPath: string;
  readonly tesseractDir: string;
  readonly generatedTypesDir: string;
  readonly translationCacheDir: string;
  readonly agentInterpretationCacheDir: string;
  readonly semanticDictionaryDir: string;
  readonly semanticDictionaryIndexPath: string;
}

export interface IntentPaths {
  readonly adoSyncDir: string;
  readonly snapshotDir: string;
  readonly archiveDir: string;
  readonly manifestPath: string;
  readonly scenariosDir: string;
  readonly benchmarksDir: string;
}

export interface KnowledgePaths {
  readonly knowledgeDir: string;
  readonly routesDir: string;
  readonly surfacesDir: string;
  readonly patternsDir: string;
}

export interface ControlPaths {
  readonly controlsDir: string;
  readonly datasetsDir: string;
  readonly resolutionControlsDir: string;
  readonly runbooksDir: string;
}

export interface ResolutionPaths {
  readonly boundDir: string;
  readonly tasksDir: string;
  readonly policyDir: string;
  readonly approvalsDir: string;
}

export interface ExecutionPaths {
  readonly runsDir: string;
  readonly sessionsDir: string;
  readonly learningDir: string;
  readonly learningManifestPath: string;
  readonly learningStatePath: string;
  readonly benchmarkRunsDir: string;
  readonly evidenceDir: string;
  readonly confidenceDir: string;
  readonly confidenceIndexPath: string;
  readonly intelligenceDir: string;
  readonly screenshotDir: string;
  readonly screenshotManifestPath: string;
}

export interface GovernancePaths {
  readonly generatedDir: string;
  readonly interfaceDir: string;
  readonly interfaceGraphIndexPath: string;
  readonly selectorCanonPath: string;
  readonly stateGraphPath: string;
  readonly discoveryDir: string;
  readonly inboxDir: string;
  readonly inboxIndexPath: string;
  readonly inboxReportPath: string;
  readonly hotspotIndexPath: string;
  readonly workbenchDir: string;
  readonly workbenchIndexPath: string;
  readonly workbenchCompletionsPath: string;
  readonly graphDir: string;
  readonly graphIndexPath: string;
  readonly mcpCatalogPath: string;
  readonly trustPolicyPath: string;
}

export interface LegacyProjectPathAliases {
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
  readonly learningStatePath: string;
  readonly intelligenceDir: string;
  readonly screenshotDir: string;
  readonly screenshotManifestPath: string;
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

export interface ProjectPaths extends LegacyProjectPathAliases {
  readonly engine: EnginePaths;
  readonly intent: IntentPaths;
  readonly knowledge: KnowledgePaths;
  readonly control: ControlPaths;
  readonly resolution: ResolutionPaths;
  readonly execution: ExecutionPaths;
  readonly governance: GovernancePaths;
}
