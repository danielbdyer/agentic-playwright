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
import { buildTaskPacketProjection, type TaskProjectionResult } from './task';
import { generateTypes } from './types';
import {
  loadWorkspaceSession,
  withBoundScenarioInWorkspaceSession,
  withScenarioInWorkspaceSession,
} from './workspace-session';

export function compileScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const stage = yield* runPipelineStage({
      name: 'compile',
      loadDependencies: () => loadWorkspaceSession({ paths: options.paths }),
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
          taskPacket: {} as never,
          taskPath: '',
          hasUnbound: bound.hasUnbound,
        });
        const interfaceIntelligence = yield* projectInterfaceIntelligence({
          paths: options.paths,
          catalog: sessionWithScenario.catalog,
        });
        const task: TaskProjectionResult = yield* buildTaskPacketProjection({
          paths: options.paths,
          compileSnapshot: initialSnapshot,
          catalog: sessionWithScenario.catalog,
          interfaceGraph: interfaceIntelligence.interfaceGraph,
          selectorCanon: interfaceIntelligence.selectorCanon,
        });
        const compileSnapshot = createCompileSnapshot({
          ...initialSnapshot,
          taskPacket: task.taskPacket,
          taskPath: task.taskPath,
        });
        const learning = yield* projectLearningArtifacts({
          paths: options.paths,
          boundScenario: bound.boundScenario,
          taskPacket: task.taskPacket,
          interfaceGraph: interfaceIntelligence.interfaceGraph,
          selectorCanon: interfaceIntelligence.selectorCanon,
        });
        const sessionWithBound = withBoundScenarioInWorkspaceSession({
          session: sessionWithScenario,
          boundScenario: bound.boundScenario,
          boundPath: bound.boundPath,
        });
        const emitted = yield* emitScenario({ paths: options.paths, compileSnapshot });
        const graph = yield* buildDerivedGraph({ paths: options.paths });
        const generatedTypes = yield* generateTypes({ paths: options.paths, catalog: sessionWithBound.catalog });
        return {
          parsed,
          bound,
          interfaceIntelligence,
          learning,
          compileSnapshot,
          emitted,
          graph,
          generatedTypes,
        };
      }),
    });

    const { parsed, bound, interfaceIntelligence, learning, compileSnapshot, emitted, graph, generatedTypes } = stage.computed;
    return {
      compileSnapshot,
      parsed,
      bound,
      interfaceIntelligence,
      learning,
      emitted,
      graph,
      generatedTypes,
      trustPolicy: stage.dependencies.catalog.trustPolicy.artifact,
    };
  });
}
