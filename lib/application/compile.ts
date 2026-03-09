import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import { bindScenario } from './bind';
import { createCompileSnapshot } from './compile-snapshot';
import { emitScenario } from './emit';
import { buildDerivedGraph } from './graph';
import { parseScenario } from './parse';
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
    const session = yield* loadWorkspaceSession({ paths: options.paths });
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
    const task: TaskProjectionResult = yield* buildTaskPacketProjection({
      paths: options.paths,
      compileSnapshot: initialSnapshot,
      catalog: sessionWithScenario.catalog,
    });
    const compileSnapshot = createCompileSnapshot({
      ...initialSnapshot,
      taskPacket: task.taskPacket,
      taskPath: task.taskPath,
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
      compileSnapshot,
      parsed,
      bound,
      emitted,
      graph,
      generatedTypes,
      trustPolicy: session.catalog.trustPolicy.artifact,
    };
  });
}
