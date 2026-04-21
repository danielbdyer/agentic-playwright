import path from 'path';
import { Effect } from 'effect';
import { createSnapshotTemplateId } from '../../domain/kernel/identity';
import { mergePatternDocuments } from '../../domain/knowledge/patterns';
import type {
  InterpretationDriftRecord,
  ProposalBundle,
  ResolutionGraphRecord,
  RunRecord,
} from '../../domain/execution/types';
import type { AgentSession } from '../../domain/handshake/session';
import type { ImprovementRun } from '../../domain/improvement/types';
import type { RouteKnowledgeManifest } from '../../domain/intent/routes';
import type { AdoSnapshot, BoundScenario, Scenario } from '../../domain/intent/types';
import type {
  BehaviorPatternDocument,
  ConfidenceOverlayCatalog,
  PatternDocument,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SurfaceGraph,
} from '../../domain/knowledge/types';
import type { ReplayExample, TrainingCorpusManifest } from '../../domain/learning/types';
import type { BenchmarkContext } from '../../domain/projection/types';
import type {
  ApprovalReceipt,
  DatasetControl,
  EvidenceRecord,
  RerunPlan,
  ResolutionControl,
  RunbookControl,
  ScenarioInterpretationSurface,
} from '../../domain/resolution/types';
import type {
  ApplicationInterfaceGraph,
  DiscoveryRun,
  SelectorCanon,
  StateTransitionGraph,
} from '../../domain/target/interface-graph';
import {
  validateAdoSnapshot,
  validateAgentSession,
  validateApprovalReceipt,
  validateBenchmarkContext,
  validateBoundScenario,
  validateApplicationInterfaceGraph,
  validateConfidenceOverlayCatalog,
  validateDatasetControl,
  validateDiscoveryRun,
  validateEvidenceRecord,
  validatePatternDocument,
  validateProposalBundle,
  validateReplayExample,
  validateResolutionControl,
  validateRerunPlan,
  validateRunRecord,
  validateRunbookControl,
  validateScenario,
  validateScenarioInterpretationSurface,
  validateScreenBehavior,
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSelectorCanon,
  validateStateTransitionGraph,
  validateSurfaceGraph,
  validateTrainingCorpusManifest,
  validateTrustPolicy,
  validateInterpretationDriftRecord,
  validateResolutionGraphRecord,
  validateBehaviorPatternDocument,
  validateRouteKnowledgeManifest,
  validateAtomArtifact,
  validateCompositionArtifact,
  validateProjectionArtifact,
} from '../../domain/validation';
import { walkFiles } from '../catalog/artifacts';
import type { ProjectPaths } from '../paths';
import { boundPath, relativeProjectPath, snapshotPath } from '../paths';
import { FileSystem, type FileSystemPort } from '../ports';
import { improvementLedgerPath, loadImprovementLedger } from '../improvement/ledger';
import { createArtifactEnvelope, upsertArtifactEnvelope } from './envelope';
import {
  bySuffix,
  byBasename,
  loadArtifactsMatching,
  loadOptionalSingleton,
  readJsonArtifact,
  readYamlArtifact,
  type ArtifactLoaderSpec,
} from './loaders';
import { assembleScreenBundles } from './screen-bundles';
import type { ArtifactEnvelope, WorkspaceCatalog } from './types';
import type { Atom } from '../../domain/pipeline/atom';
import type { Composition } from '../../domain/pipeline/composition';
import type { Projection } from '../../domain/pipeline/projection';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import type { AtomClass } from '../../domain/pipeline/atom-address';
import type { CompositionSubType } from '../../domain/pipeline/composition-address';
import type { ProjectionSubType } from '../../domain/pipeline/projection-address';
import type { KnowledgePosture } from '../../domain/governance/workflow-types';
import { postureIncludesKnowledge } from '../../domain/governance/workflow-types';
import { parseSnapshotToScenario } from '../intent/parse';
import { fingerprintArtifact } from './envelope';
import { projectScenarioToTier1 } from '../../domain/scenario/tier-projection';

/** Normalize a route manifest so fingerprinting sees a canonical
 *  shape regardless of on-disk key order. Applied as the
 *  `postprocess` hook on the routeManifests loader spec so the
 *  artifact's fingerprint is recomputed after normalization. */
function normalizeRouteManifest(manifest: RouteKnowledgeManifest): RouteKnowledgeManifest {
  return {
    ...manifest,
    routes: [...manifest.routes]
      .map((route) => ({
        ...route,
        variants: [...route.variants]
          .map((variant) => ({
            ...variant,
            query: Object.fromEntries(Object.entries(variant.query ?? {}).sort((left, right) => left[0].localeCompare(right[0]))),
            state: Object.fromEntries(Object.entries(variant.state ?? {}).sort((left, right) => left[0].localeCompare(right[0]))),
            mappedScreens: [...new Set(variant.mappedScreens ?? [variant.screen])].sort((left, right) => left.localeCompare(right)),
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

/**
 * Controls how much of the workspace is loaded. Each scope is a strict
 * superset of the previous one, so callers that only need compilation
 * inputs avoid touching run records, sessions, evidence, or learning
 * artifacts — saving significant heap and I/O at scale.
 *
 * - `compile`:  scenarios + knowledge + controls + bound programs + trust policy.
 *               Skips: runs, sessions, evidence, proposals, learning, discovery,
 *               generated, inbox, approvals, replays.
 * - `post-run`: everything in compile + run records + proposal bundles +
 *               interpretation surfaces + resolution graph records + drift records.
 *               Skips: sessions, evidence, learning, discovery, replays.
 * - `full`:     current behavior — loads everything.
 */
export type CatalogScope = 'full' | 'compile' | 'post-run';

export interface LoadCatalogOptions {
  readonly paths: ProjectPaths;
  /**
   * Knowledge posture controls which tiers of content are loaded.
   *
   * - `cold-start`: Skip all pre-existing knowledge (screens, patterns, surfaces,
   *    snapshots, routes). The system must discover everything from scratch.
   * - `warm-start`: Load all canonical knowledge. Default for backward compatibility.
   * - `production`: Same as warm-start at runtime.
   */
  readonly knowledgePosture?: KnowledgePosture | undefined;
  /**
   * Controls how much of the workspace to load. Defaults to `'full'`.
   * Use `'compile'` for pre-run catalog loads and `'post-run'` for
   * post-run loads in the dogfood loop to avoid loading unnecessary
   * artifacts and reduce memory pressure.
   */
  readonly scope?: CatalogScope | undefined;
}

/** Walk a directory if the posture includes knowledge; otherwise return empty. */
function walkKnowledgeDir(
  fs: FileSystemPort, dir: string, posture: KnowledgePosture,
) {
  return postureIncludesKnowledge(posture)
    ? walkFiles(fs, dir)
    : Effect.succeed([] as string[]);
}

const SCOPE_LEVEL: Record<CatalogScope, number> = { compile: 0, 'post-run': 1, full: 2 };

/** Walk a directory only when scope is at or above the required level. */
function walkScopedDir(
  fs: FileSystemPort, dir: string, scope: CatalogScope, requiredScope: CatalogScope,
): Effect.Effect<readonly string[], unknown, unknown> {
  return SCOPE_LEVEL[scope] >= SCOPE_LEVEL[requiredScope]
    ? walkFiles(fs, dir)
    : Effect.succeed([] as string[]);
}

/** Diagnostic counter: total loadWorkspaceCatalog calls since process start. */
let catalogLoadCount = 0;
/** Read the current catalog load count (for diagnostics/testing). */
export function getCatalogLoadCount(): number { return catalogLoadCount; }
/** Reset catalog load counter (for testing). */
export function resetCatalogLoadCount(): void { catalogLoadCount = 0; }

export function loadWorkspaceCatalog(options: LoadCatalogOptions) {
  const posture: KnowledgePosture = options.knowledgePosture ?? 'warm-start';
  const scope: CatalogScope = options.scope ?? 'full';

  return Effect.gen(function* () {
    catalogLoadCount += 1;
    const fs = yield* FileSystem;

    // Phase 1: Walk all independent directories in parallel.
    // Knowledge directories are gated by the knowledge posture —
    // cold-start returns empty arrays, forcing the system to learn from scratch.
    // Runtime-heavy directories (runs, sessions, evidence, etc.) are gated by scope
    // so that compile-only and post-run loads skip unnecessary I/O.
    const walks = yield* Effect.all({
      // Always loaded (compile-scope and above)
      surfaces: walkKnowledgeDir(fs, options.paths.surfacesDir, posture),
      screens: walkKnowledgeDir(fs, path.join(options.paths.knowledgeDir, 'screens'), posture),
      patterns: walkKnowledgeDir(fs, options.paths.patternsDir, posture),
      datasets: walkFiles(fs, options.paths.datasetsDir),
      benchmarks: walkFiles(fs, options.paths.benchmarksDir),
      resolutionControls: walkFiles(fs, options.paths.resolutionControlsDir),
      runbooks: walkFiles(fs, options.paths.runbooksDir),
      knowledgeSnapshots: walkKnowledgeDir(fs, path.join(options.paths.knowledgeDir, 'snapshots'), posture),
      snapshots: walkFiles(fs, options.paths.snapshotDir),
      scenarios: walkFiles(fs, options.paths.scenariosDir),
      bound: walkFiles(fs, options.paths.boundDir),
      tasks: walkFiles(fs, options.paths.tasksDir),
      routes: walkKnowledgeDir(fs, options.paths.routesDir, posture),

      // Post-run scope: run records, proposals, generated output, inbox, approvals
      runs: walkScopedDir(fs, options.paths.runsDir, scope, 'post-run'),
      generated: walkScopedDir(fs, options.paths.generatedDir, scope, 'post-run'),
      inbox: walkScopedDir(fs, options.paths.inboxDir, scope, 'post-run'),
      approvals: walkScopedDir(fs, options.paths.approvalsDir, scope, 'post-run'),

      // Full scope only: sessions, evidence, discovery, replays
      discovery: walkScopedDir(fs, options.paths.discoveryDir, scope, 'full'),
      evidence: walkScopedDir(fs, options.paths.evidenceDir, scope, 'full'),
      sessions: walkScopedDir(fs, options.paths.sessionsDir, scope, 'full'),
      replays: walkScopedDir(fs, path.join(options.paths.learningDir, 'replays'), scope, 'full'),

      // Three-tier interface model canonical artifact store
      // (docs/canon-and-derivation.md § 3.5–3.8). Each tier walks
      // both source flavors (agentic + deterministic). The walker
      // is recursive — per-atom-class subdirectories below the
      // flavor root are picked up automatically.
      tier1AtomsAgentic: walkFiles(fs, options.paths.pipeline.atomsAgenticDir),
      tier1AtomsDeterministic: walkFiles(fs, options.paths.pipeline.atomsDeterministicDir),
      tier2CompositionsAgentic: walkFiles(fs, options.paths.pipeline.compositionsAgenticDir),
      tier2CompositionsDeterministic: walkFiles(fs, options.paths.pipeline.compositionsDeterministicDir),
      tier3ProjectionsAgentic: walkFiles(fs, options.paths.pipeline.projectionsAgenticDir),
      tier3ProjectionsDeterministic: walkFiles(fs, options.paths.pipeline.projectionsDeterministicDir),
    }, { concurrency: 'unbounded' });

    // Phase 2: Load all artifact types in parallel (each group is
    // independent). Every entry is a `loadArtifactsMatching(paths,
    // files, spec)` call — the spec is first-class data describing
    // (source format, lifetime, filter predicate, validator,
    // error code, label, optional postprocess). Adding a new
    // artifact kind means adding one entry below.
    const loaded = yield* Effect.all({
      surfaces: loadArtifactsMatching<SurfaceGraph>(options.paths, walks.surfaces, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.surface.yaml'),
        validate: validateSurfaceGraph, errorCode: 'surface-validation-failed', label: 'Surface graph',
      }),
      screenElements: loadArtifactsMatching<ScreenElements>(options.paths, walks.screens, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.elements.yaml'),
        validate: validateScreenElements, errorCode: 'elements-validation-failed', label: 'Elements',
      }),
      screenHints: loadArtifactsMatching<ScreenHints>(options.paths, walks.screens, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.hints.yaml'),
        validate: validateScreenHints, errorCode: 'screen-hints-validation-failed', label: 'Hints',
      }),
      screenPostures: loadArtifactsMatching<ScreenPostures>(options.paths, walks.screens, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.postures.yaml'),
        validate: validateScreenPostures, errorCode: 'postures-validation-failed', label: 'Postures',
      }),
      screenBehaviors: loadArtifactsMatching<ScreenBehavior>(options.paths, walks.screens, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.behavior.yaml'),
        validate: validateScreenBehavior, errorCode: 'screen-behavior-validation-failed', label: 'Screen behavior',
      }),
      patternDocuments: loadArtifactsMatching<PatternDocument>(options.paths, walks.patterns, {
        source: 'yaml', lifetime: 'required',
        match: (f) => f.endsWith('.yaml') && !f.endsWith('.behavior.yaml'),
        validate: validatePatternDocument, errorCode: 'pattern-document-validation-failed', label: 'Pattern document',
      }),
      behaviorPatterns: loadArtifactsMatching<BehaviorPatternDocument>(options.paths, walks.patterns, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.behavior.yaml'),
        validate: validateBehaviorPatternDocument, errorCode: 'behavior-pattern-document-validation-failed', label: 'Behavior pattern',
      }),
      datasets: loadArtifactsMatching<DatasetControl>(options.paths, walks.datasets, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.dataset.yaml'),
        validate: validateDatasetControl, errorCode: 'dataset-control-validation-failed', label: 'Dataset control',
      }),
      benchmarks: loadArtifactsMatching<BenchmarkContext>(options.paths, walks.benchmarks, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.benchmark.yaml'),
        validate: validateBenchmarkContext, errorCode: 'benchmark-context-validation-failed', label: 'Benchmark',
      }),
      resolutionControls: loadArtifactsMatching<ResolutionControl>(options.paths, walks.resolutionControls, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.resolution.yaml'),
        validate: validateResolutionControl, errorCode: 'resolution-control-validation-failed', label: 'Resolution control',
      }),
      runbooks: loadArtifactsMatching<RunbookControl>(options.paths, walks.runbooks, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.runbook.yaml'),
        validate: validateRunbookControl, errorCode: 'runbook-control-validation-failed', label: 'Runbook',
      }),
      snapshots: loadArtifactsMatching<AdoSnapshot>(options.paths, walks.snapshots, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateAdoSnapshot, errorCode: 'snapshot-validation-failed', label: 'Snapshot',
      }),
      scenarios: loadArtifactsMatching<Scenario>(options.paths, walks.scenarios, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.scenario.yaml'),
        validate: validateScenario, errorCode: 'scenario-validation-failed', label: 'Scenario',
      }),
      boundScenarios: loadArtifactsMatching<BoundScenario>(options.paths, walks.bound, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateBoundScenario, errorCode: 'bound-scenario-validation-failed', label: 'Bound scenario',
      }),
      interpretationSurfaces: loadArtifactsMatching<ScenarioInterpretationSurface>(options.paths, walks.tasks, {
        source: 'json', lifetime: 'disposable', match: bySuffix('.resolution.json'),
        validate: validateScenarioInterpretationSurface,
        errorCode: 'scenario-interpretation-surface-validation-failed',
        label: 'Scenario interpretation surface',
      }),
      runRecords: loadArtifactsMatching<RunRecord>(options.paths, walks.runs, {
        source: 'json', lifetime: 'disposable', match: byBasename('run.json'),
        validate: validateRunRecord, errorCode: 'run-record-validation-failed', label: 'Run record',
      }),
      routeManifests: loadArtifactsMatching<RouteKnowledgeManifest>(options.paths, walks.routes, {
        source: 'yaml', lifetime: 'required', match: bySuffix('.routes.yaml'),
        validate: validateRouteKnowledgeManifest, errorCode: 'route-knowledge-validation-failed', label: 'Route knowledge',
        postprocess: normalizeRouteManifest,
      }),
      discoveryRuns: loadArtifactsMatching<DiscoveryRun>(options.paths, walks.discovery, {
        source: 'json', lifetime: 'required', match: byBasename('crawl.json'),
        validate: validateDiscoveryRun, errorCode: 'discovery-run-validation-failed', label: 'Discovery run',
      }),
      resolutionGraphRecords: loadArtifactsMatching<ResolutionGraphRecord>(options.paths, walks.runs, {
        source: 'json', lifetime: 'disposable', match: byBasename('resolution-graph.json'),
        validate: validateResolutionGraphRecord, errorCode: 'resolution-graph-validation-failed', label: 'Resolution graph',
      }),
      interpretationDriftRecords: loadArtifactsMatching<InterpretationDriftRecord>(options.paths, walks.runs, {
        source: 'json', lifetime: 'disposable', match: byBasename('interpretation-drift.json'),
        validate: validateInterpretationDriftRecord, errorCode: 'interpretation-drift-validation-failed', label: 'Interpretation drift',
      }),
      proposalBundles: loadArtifactsMatching<ProposalBundle>(options.paths, walks.generated, {
        source: 'json', lifetime: 'disposable', match: bySuffix('.proposals.json'),
        validate: validateProposalBundle, errorCode: 'proposal-bundle-validation-failed', label: 'Proposal bundle',
      }),
      rerunPlans: loadArtifactsMatching<RerunPlan>(options.paths, walks.inbox, {
        source: 'json', lifetime: 'disposable', match: bySuffix('.rerun-plan.json'),
        validate: validateRerunPlan, errorCode: 'rerun-plan-validation-failed', label: 'Rerun plan',
      }),
      approvalReceipts: loadArtifactsMatching<ApprovalReceipt>(options.paths, walks.approvals, {
        source: 'json', lifetime: 'disposable', match: bySuffix('.approval.json'),
        validate: validateApprovalReceipt, errorCode: 'approval-receipt-validation-failed', label: 'Approval receipt',
      }),
      evidenceRecords: loadArtifactsMatching<EvidenceRecord>(options.paths, walks.evidence, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateEvidenceRecord, errorCode: 'evidence-validation-failed', label: 'Evidence',
      }),
      agentSessions: loadArtifactsMatching<AgentSession>(options.paths, walks.sessions, {
        source: 'json', lifetime: 'disposable', match: byBasename('session.json'),
        validate: validateAgentSession, errorCode: 'agent-session-validation-failed', label: 'Agent session',
      }),
      replayExamples: loadArtifactsMatching<ReplayExample>(options.paths, walks.replays, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateReplayExample, errorCode: 'replay-example-validation-failed', label: 'Replay example',
      }),

      // Three-tier interface model loaders. Each tier loads both
      // source flavors (agentic + deterministic) into a single
      // array; consumers distinguish flavor via the envelope's
      // `artifact.source` field. Files use the .json extension and
      // are validated by the Effect Schema decoders in
      // product/domain/schemas/pipeline.ts.
      tier1AtomsAgentic: loadArtifactsMatching<Atom<AtomClass, unknown, PhaseOutputSource>>(options.paths, walks.tier1AtomsAgentic, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateAtomArtifact, errorCode: 'atom-validation-failed', label: 'Atom (agentic)',
      }),
      tier1AtomsDeterministic: loadArtifactsMatching<Atom<AtomClass, unknown, PhaseOutputSource>>(options.paths, walks.tier1AtomsDeterministic, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateAtomArtifact, errorCode: 'atom-validation-failed', label: 'Atom (deterministic)',
      }),
      tier2CompositionsAgentic: loadArtifactsMatching<Composition<CompositionSubType, unknown, PhaseOutputSource>>(options.paths, walks.tier2CompositionsAgentic, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateCompositionArtifact, errorCode: 'composition-validation-failed', label: 'Composition (agentic)',
      }),
      tier2CompositionsDeterministic: loadArtifactsMatching<Composition<CompositionSubType, unknown, PhaseOutputSource>>(options.paths, walks.tier2CompositionsDeterministic, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateCompositionArtifact, errorCode: 'composition-validation-failed', label: 'Composition (deterministic)',
      }),
      tier3ProjectionsAgentic: loadArtifactsMatching<Projection<ProjectionSubType, PhaseOutputSource>>(options.paths, walks.tier3ProjectionsAgentic, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateProjectionArtifact, errorCode: 'projection-validation-failed', label: 'Projection (agentic)',
      }),
      tier3ProjectionsDeterministic: loadArtifactsMatching<Projection<ProjectionSubType, PhaseOutputSource>>(options.paths, walks.tier3ProjectionsDeterministic, {
        source: 'json', lifetime: 'required', match: bySuffix('.json'),
        validate: validateProjectionArtifact, errorCode: 'projection-validation-failed', label: 'Projection (deterministic)',
      }),
    }, { concurrency: 'unbounded' });

    const knowledgeSnapshots = walks.knowledgeSnapshots
      .flatMap((filePath) => filePath.endsWith('.yaml') ? [{
        relativePath: createSnapshotTemplateId(relativeProjectPath(options.paths, filePath).replace(/^knowledge\//, '')),
        artifactPath: relativeProjectPath(options.paths, filePath),
        absolutePath: filePath,
      }] : []);

    // Phase 3: Load optional singletons (conditional on existence).
    // Each `loadOptionalSingleton` call handles the fs.exists check
    // and returns null if the file is missing. Disposable-lifetime
    // singletons catch validation errors and return null too,
    // matching the prior `readDisposableSingleton` behavior.
    const confidenceCatalog = yield* loadOptionalSingleton<ConfidenceOverlayCatalog>(
      options.paths, options.paths.confidenceIndexPath, {
        source: 'json', lifetime: 'required',
        validate: validateConfidenceOverlayCatalog,
        errorCode: 'confidence-overlay-catalog-validation-failed',
        label: 'Confidence overlay catalog',
      });

    const interfaceGraph = yield* loadOptionalSingleton<ApplicationInterfaceGraph>(
      options.paths, options.paths.interfaceGraphIndexPath, {
        source: 'json', lifetime: 'disposable',
        validate: validateApplicationInterfaceGraph,
        errorCode: 'application-interface-graph-validation-failed',
        label: 'Application interface graph',
      });

    const selectorCanon = yield* loadOptionalSingleton<SelectorCanon>(
      options.paths, options.paths.selectorCanonPath, {
        source: 'json', lifetime: 'disposable',
        validate: validateSelectorCanon,
        errorCode: 'selector-canon-validation-failed',
        label: 'Selector canon',
      });

    const stateGraph = yield* loadOptionalSingleton<StateTransitionGraph>(
      options.paths, options.paths.stateGraphPath, {
        source: 'json', lifetime: 'disposable',
        validate: validateStateTransitionGraph,
        errorCode: 'state-transition-graph-validation-failed',
        label: 'State transition graph',
      });

    const learningManifest = yield* loadOptionalSingleton<TrainingCorpusManifest>(
      options.paths, options.paths.learningManifestPath, {
        source: 'json', lifetime: 'required',
        validate: validateTrainingCorpusManifest,
        errorCode: 'training-corpus-manifest-validation-failed',
        label: 'Training corpus manifest',
      });

    const improvementRuns = (() => {
      const absolutePath = improvementLedgerPath(options.paths);
      return fs.exists(absolutePath).pipe(
        Effect.flatMap((exists) =>
          exists
            ? loadImprovementLedger(options.paths).pipe(
                Effect.map((ledger) =>
                  ledger.runs.map((run) => createArtifactEnvelope(options.paths, absolutePath, run)),
                ),
              )
            : Effect.succeed([] as ArtifactEnvelope<ImprovementRun>[]),
        ),
      );
    })();

    const trustPolicy = yield* readYamlArtifact(
      options.paths,
      options.paths.trustPolicyPath,
      validateTrustPolicy,
      'trust-policy-validation-failed',
      `Trust policy ${options.paths.trustPolicyPath} failed validation`,
    );

    // In cold-start mode, derive scenarios directly from ADO snapshots rather than
    // loading authored scenario files. The snapshot IS the Tier 1 source of truth —
    // there is no need to load a derivative and strip it back to intent-only.
    // In warm/production posture, use authored scenarios as-is. In cold-start,
    // derive from snapshots (Tier 1 by construction) and apply projectScenarioToTier1
    // as a guard to ensure no Tier 2 data leaks through authored scenarios.
    const scenarios: ArtifactEnvelope<Scenario>[] = postureIncludesKnowledge(posture)
      ? loaded.scenarios
      : loaded.snapshots.length > 0
        ? loaded.snapshots.map((snapshotEnvelope) => {
            const scenario = parseSnapshotToScenario(snapshotEnvelope.artifact);
            return {
              artifact: scenario,
              artifactPath: `derived://snapshot/${snapshotEnvelope.artifact.id}`,
              absolutePath: snapshotEnvelope.absolutePath,
              fingerprint: fingerprintArtifact(scenario),
            };
          })
        : loaded.scenarios.map((entry) => ({
            ...entry,
            artifact: projectScenarioToTier1(entry.artifact),
            fingerprint: fingerprintArtifact(projectScenarioToTier1(entry.artifact)),
          }));

    return {
      paths: options.paths,
      snapshots: loaded.snapshots,
      scenarios,
      boundScenarios: loaded.boundScenarios,
      interpretationSurfaces: loaded.interpretationSurfaces,
      runRecords: loaded.runRecords,
      proposalBundles: loaded.proposalBundles,
      approvalReceipts: loaded.approvalReceipts,
      rerunPlans: loaded.rerunPlans,
      datasets: loaded.datasets,
      benchmarks: loaded.benchmarks,
      // routeManifests are already normalized + re-fingerprinted
      // via the `postprocess: normalizeRouteManifest` hook on their
      // loader spec above. No additional post-processing needed.
      routeManifests: loaded.routeManifests,
      resolutionControls: loaded.resolutionControls,
      runbooks: loaded.runbooks,
      surfaces: loaded.surfaces,
      screenElements: loaded.screenElements,
      screenHints: loaded.screenHints,
      screenPostures: loaded.screenPostures,
      screenBehaviors: loaded.screenBehaviors,
      screenBundles: assembleScreenBundles({
        surfaces: loaded.surfaces,
        screenElements: loaded.screenElements,
        screenHints: loaded.screenHints,
        screenPostures: loaded.screenPostures,
      }),
      patternDocuments: loaded.patternDocuments,
      behaviorPatterns: loaded.behaviorPatterns,
      mergedPatterns: mergePatternDocuments(loaded.patternDocuments.map((entry) => ({
        artifactPath: entry.artifactPath,
        artifact: entry.artifact,
      }))),
      knowledgeSnapshots,
      discoveryRuns: loaded.discoveryRuns,
      evidenceRecords: loaded.evidenceRecords,
      interpretationDriftRecords: loaded.interpretationDriftRecords,
      resolutionGraphRecords: loaded.resolutionGraphRecords,
      confidenceCatalog,
      interfaceGraph,
      selectorCanon,
      stateGraph,
      agentSessions: loaded.agentSessions,
      improvementRuns: yield* improvementRuns,
      learningManifest,
      replayExamples: loaded.replayExamples,
      trustPolicy,
      // Three-tier interface model canonical artifacts. Per
      // docs/canon-and-derivation.md § 3.5–3.8, loaded from
      // {suiteRoot}/.canonical-artifacts/{atoms,compositions,projections}/{agentic,deterministic}/.
      // Each tier concatenates both source flavors into one array;
      // consumers distinguish flavor via envelope.artifact.source.
      // Empty until Phase 2 decomposition lands.
      tier1Atoms: [...loaded.tier1AtomsAgentic, ...loaded.tier1AtomsDeterministic],
      tier2Compositions: [...loaded.tier2CompositionsAgentic, ...loaded.tier2CompositionsDeterministic],
      tier3Projections: [...loaded.tier3ProjectionsAgentic, ...loaded.tier3ProjectionsDeterministic],
    } satisfies WorkspaceCatalog;
  });
}

export function upsertWorkspaceCatalogScenario(
  catalog: WorkspaceCatalog,
  input: { scenario: Scenario; scenarioPath: string },
): WorkspaceCatalog {
  const entry = createArtifactEnvelope(catalog.paths, input.scenarioPath, input.scenario);
  return {
    ...catalog,
    scenarios: upsertArtifactEnvelope(
      catalog.scenarios,
      entry,
      (candidate) => candidate.artifact.source.ado_id === input.scenario.source.ado_id,
    ),
  };
}

export function upsertWorkspaceCatalogBoundScenario(
  catalog: WorkspaceCatalog,
  input: { boundScenario: BoundScenario; boundPath: string },
): WorkspaceCatalog {
  const entry = createArtifactEnvelope(catalog.paths, input.boundPath, input.boundScenario);
  return {
    ...catalog,
    boundScenarios: upsertArtifactEnvelope(
      catalog.boundScenarios,
      entry,
      (candidate) => candidate.artifact.source.ado_id === input.boundScenario.source.ado_id,
    ),
  };
}

export function loadScenarioArtifact(options: { paths: ProjectPaths; adoId: AdoSnapshot['id'] }) {
  return Effect.gen(function* () {
    const target = boundPath(options.paths, options.adoId);
    return yield* readJsonArtifact(
      options.paths,
      target,
      validateBoundScenario,
      'bound-scenario-validation-failed',
      `Bound scenario ${options.adoId} failed validation`,
    );
  });
}

/**
 * Delta-reload only proposals and run records into an existing catalog.
 *
 * After proposal activation in the improvement loop, the full catalog is
 * already loaded. Only proposals and run records change. This avoids
 * re-walking and re-parsing all scenarios, knowledge, controls, and other
 * stable artifacts, saving 30-40% of per-iteration catalog reload time.
 */
export function deltaReloadProposalsAndRuns(
  catalog: WorkspaceCatalog,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const [generatedFiles, runFiles] = yield* Effect.all([
      walkFiles(fs, catalog.paths.generatedDir),
      walkFiles(fs, catalog.paths.runsDir),
    ], { concurrency: 'unbounded' });

    const [proposalBundles, runRecords, resolutionGraphRecords, interpretationDriftRecords] = yield* Effect.all([
      loadArtifactsMatching<ProposalBundle>(catalog.paths, generatedFiles, {
        source: 'json', lifetime: 'disposable', match: bySuffix('.proposals.json'),
        validate: validateProposalBundle, errorCode: 'proposal-bundle-validation-failed', label: 'Proposal bundle',
      }),
      loadArtifactsMatching<RunRecord>(catalog.paths, runFiles, {
        source: 'json', lifetime: 'disposable', match: byBasename('run.json'),
        validate: validateRunRecord, errorCode: 'run-record-validation-failed', label: 'Run record',
      }),
      loadArtifactsMatching<ResolutionGraphRecord>(catalog.paths, runFiles, {
        source: 'json', lifetime: 'disposable', match: byBasename('resolution-graph.json'),
        validate: validateResolutionGraphRecord, errorCode: 'resolution-graph-validation-failed', label: 'Resolution graph',
      }),
      loadArtifactsMatching<InterpretationDriftRecord>(catalog.paths, runFiles, {
        source: 'json', lifetime: 'disposable', match: byBasename('interpretation-drift.json'),
        validate: validateInterpretationDriftRecord, errorCode: 'interpretation-drift-validation-failed', label: 'Interpretation drift',
      }),
    ], { concurrency: 'unbounded' });

    return {
      ...catalog,
      proposalBundles,
      runRecords,
      resolutionGraphRecords,
      interpretationDriftRecords,
    } satisfies WorkspaceCatalog;
  });
}

export function loadSnapshotArtifact(options: { paths: ProjectPaths; adoId: AdoSnapshot['id'] }) {
  return readJsonArtifact(
    options.paths,
    snapshotPath(options.paths, options.adoId),
    validateAdoSnapshot,
    'snapshot-validation-failed',
    `Snapshot ${options.adoId} failed validation`,
  );
}
