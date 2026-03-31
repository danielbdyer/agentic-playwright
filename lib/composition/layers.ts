import { Effect, Layer } from 'effect';
import {
  AdoSource,
  ControlRepository,
  ExecutionContext,
  ExecutionRepository,
  FileSystem,
  GovernanceRepository,
  IntentRepository,
  KnowledgeRepository,
  ResolutionTaskRepository,
  RuntimeScenarioRunner,
} from '../application/ports';
import { createProjectPaths } from '../application/paths';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createRecordingWorkspaceFileSystem } from '../infrastructure/fs/recording-fs';
import {
  makeLocalControlRepository,
  makeLocalExecutionRepository,
  makeLocalGovernanceRepository,
  makeLocalIntentRepository,
  makeLocalKnowledgeRepository,
  makeLocalResolutionTaskRepository,
} from '../infrastructure/repositories/local-context-repositories';
import { LocalRuntimeScenarioRunner } from './local-runtime-scenario-runner';
import type { ExecutionPosture, WriteJournalEntry } from '../domain/types';

export const FileSystemLive = Layer.succeed(FileSystem, LocalFileSystem);

export const AdoSourceLive = (rootDir: string, suiteRoot?: string) =>
  Layer.succeed(AdoSource, makeLocalAdoSource(rootDir, suiteRoot));

export const RuntimeScenarioRunnerLive =
  Layer.succeed(RuntimeScenarioRunner, LocalRuntimeScenarioRunner);

export const ExecutionContextLive = (posture: ExecutionPosture) =>
  Layer.succeed(ExecutionContext, {
    posture,
    writeJournal: () => [] as WriteJournalEntry[],
  });

export const RecordingFileSystemLive = (rootDir: string, posture: ExecutionPosture, journal: WriteJournalEntry[], suiteRoot?: string) =>
  Layer.succeed(
    FileSystem,
    createRecordingWorkspaceFileSystem({
      rootDir,
      suiteRoot,
      posture,
      delegate: LocalFileSystem,
      journal,
    }),
  );

export const LocalServicesLive = (rootDir: string, posture: ExecutionPosture, journal: WriteJournalEntry[], suiteRoot?: string) =>
  Layer.unwrapEffect(Effect.gen(function* () {
    const paths = createProjectPaths(rootDir, suiteRoot);
    const fs = createRecordingWorkspaceFileSystem({
      rootDir,
      suiteRoot,
      posture,
      delegate: LocalFileSystem,
      journal,
    });
    return Layer.mergeAll(
      Layer.succeed(FileSystem, fs),
      Layer.succeed(IntentRepository, makeLocalIntentRepository(paths, fs)),
      Layer.succeed(KnowledgeRepository, makeLocalKnowledgeRepository(paths, fs)),
      Layer.succeed(ControlRepository, makeLocalControlRepository(paths, fs)),
      Layer.succeed(ResolutionTaskRepository, makeLocalResolutionTaskRepository(paths, fs)),
      Layer.succeed(ExecutionRepository, makeLocalExecutionRepository(paths, fs)),
      Layer.succeed(GovernanceRepository, makeLocalGovernanceRepository(paths, fs)),
      AdoSourceLive(rootDir, suiteRoot),
      RuntimeScenarioRunnerLive,
      ExecutionContextLive(posture),
    );
  }));
