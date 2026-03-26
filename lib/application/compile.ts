import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import { bindScenario } from './bind';
import { createCompileSnapshot } from './compile-snapshot';
import { emitScenario } from './emit';
import { buildDerivedGraph } from './graph';
import { projectInterfaceIntelligence } from './interface-intelligence';
import { projectLearningArtifacts } from './learning';
import { parseScenario } from './parse';
import { runPipelineStage } from './pipeline';
import type { ProjectPaths } from './paths';
import { buildInterpretationSurfaceProjection, type TaskProjectionResult } from './task';
import { generateTypes } from './types';
import {
  loadWorkspaceSession,
  withBoundScenarioInWorkspaceSession,
  withScenarioInWorkspaceSession,
} from './workspace-session';

/**
 * Core compilation: parse, bind, project surfaces, emit — but skip global
 * graph and types derivation. Use this when compiling multiple scenarios
 * concurrently; call `buildDerivedGraph` and `generateTypes` once afterward.
 */
export function compileScenarioCore(options: { adoId: AdoId; paths: ProjectPaths; catalog?: import('./catalog').WorkspaceCatalog }) {
  return Effect.gen(function* () {
    const stage = yield* runPipelineStage({
      name: 'compile',
      loadDependencies: () => loadWorkspaceSession({ paths: options.paths, ...(options.catalog ? { catalog: options.catalog } : {}) }),
      compute: (session) => Effect.gen(function* () {
        const parsed = yield* parseScenario({ ...options, session });
        const sessionWithScenario = withScenarioInWorkspaceSession({
          session,
          scenario: parsed.scenario,
          scenarioPath: parsed.scenarioPath,
        });
        const bound = yield* bindScenario({ ...options, session: sessionWithScenario });
        const initialSnapshot = createCompileSnapshot({
          adoId: options.adoId,
          scenario: parsed.scenario,
          scenarioPath: parsed.scenarioPath,
          boundScenario: bound.boundScenario,
          boundPath: bound.boundPath,
          surface: null as never,
          surfacePath: '',
          hasUnbound: bound.hasUnbound,
        });
        const interfaceIntelligence = yield* projectInterfaceIntelligence({
          paths: options.paths,
          catalog: sessionWithScenario.catalog,
        });
        const task: TaskProjectionResult = yield* buildInterpretationSurfaceProjection({
          paths: options.paths,
          compileSnapshot: initialSnapshot,
          catalog: sessionWithScenario.catalog,
          interfaceGraph: interfaceIntelligence.interfaceGraph,
          selectorCanon: interfaceIntelligence.selectorCanon,
          stateGraph: interfaceIntelligence.stateGraph,
        });
        const compileSnapshot = createCompileSnapshot({
          ...initialSnapshot,
          surface: task.surface,
          surfacePath: task.surfacePath,
        });
        const learning = yield* projectLearningArtifacts({
          paths: options.paths,
          boundScenario: bound.boundScenario,
          surface: task.surface,
          interfaceGraph: interfaceIntelligence.interfaceGraph,
          selectorCanon: interfaceIntelligence.selectorCanon,
        });
        const sessionWithBound = withBoundScenarioInWorkspaceSession({
          session: sessionWithScenario,
          boundScenario: bound.boundScenario,
          boundPath: bound.boundPath,
        });
        const emitted = yield* emitScenario({ paths: options.paths, compileSnapshot });
        return {
          parsed,
          bound,
          interfaceIntelligence,
          learning,
          compileSnapshot,
          emitted,
        };
      }),
    });

    return {
      ...stage.computed,
      trustPolicy: stage.dependencies.catalog.trustPolicy.artifact,
    };
  }).pipe(Effect.withSpan('compile-scenario-core', { attributes: { adoId: options.adoId } }));
}

/**
 * Full compilation: core + global graph and types derivation.
 * Use this for single-scenario compilation (tests, CLI). For batch
 * compilation, prefer `compileScenarioCore` + a single graph/types pass.
 */
export function compileScenario(options: { adoId: AdoId; paths: ProjectPaths; catalog?: import('./catalog').WorkspaceCatalog }) {
  return Effect.gen(function* () {
    const core = yield* compileScenarioCore(options);
    const { graph, generatedTypes } = yield* Effect.all({
      graph: buildDerivedGraph({ paths: options.paths }),
      generatedTypes: generateTypes({ paths: options.paths }),
    }, { concurrency: 'unbounded' });
    return {
      ...core,
      graph,
      generatedTypes,
    };
  }).pipe(Effect.withSpan('compile-scenario', { attributes: { adoId: options.adoId } }));
}
