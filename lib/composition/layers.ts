import { Layer } from 'effect';
import { AdoSource, ExecutionContext, FileSystem, RuntimeScenarioRunner } from '../application/ports';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createRecordingWorkspaceFileSystem } from '../infrastructure/fs/recording-fs';
import { LocalRuntimeScenarioRunner } from './local-runtime-scenario-runner';
import type { ExecutionPosture, WriteJournalEntry } from '../domain/types';

export const FileSystemLive = Layer.succeed(FileSystem, LocalFileSystem);

export const AdoSourceLive = (rootDir: string) =>
  Layer.succeed(AdoSource, makeLocalAdoSource(rootDir));

export const RuntimeScenarioRunnerLive =
  Layer.succeed(RuntimeScenarioRunner, LocalRuntimeScenarioRunner);

export const ExecutionContextLive = (posture: ExecutionPosture) =>
  Layer.succeed(ExecutionContext, {
    posture,
    writeJournal: () => [] as WriteJournalEntry[],
  });

export const RecordingFileSystemLive = (rootDir: string, posture: ExecutionPosture, journal: WriteJournalEntry[]) =>
  Layer.succeed(
    FileSystem,
    createRecordingWorkspaceFileSystem({
      rootDir,
      posture,
      delegate: LocalFileSystem,
      journal,
    }),
  );

export const LocalServicesLive = (rootDir: string, posture: ExecutionPosture, journal: WriteJournalEntry[]) =>
  Layer.mergeAll(
    RecordingFileSystemLive(rootDir, posture, journal),
    AdoSourceLive(rootDir),
    RuntimeScenarioRunnerLive,
    ExecutionContextLive(posture),
  );
