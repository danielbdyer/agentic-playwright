import { Layer } from 'effect';
import { AdoSource, FileSystem } from '../application/ports/infrastructure-ports';
import { ExecutionContext, ExecutionScenarioRunner } from '../application/ports/execution-ports';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createRecordingWorkspaceFileSystem } from '../infrastructure/fs/recording-fs';
import { LocalRuntimeScenarioRunner } from './local-runtime-scenario-runner';
import type { ExecutionPosture, WriteJournalEntry } from '../domain/types';

export const FileSystemLive = Layer.succeed(FileSystem, LocalFileSystem);

export const AdoSourceLive = (rootDir: string, suiteRoot?: string) =>
  Layer.succeed(AdoSource, makeLocalAdoSource(rootDir, suiteRoot));

export const ExecutionScenarioRunnerLive =
  Layer.succeed(ExecutionScenarioRunner, LocalRuntimeScenarioRunner);

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
  Layer.mergeAll(
    RecordingFileSystemLive(rootDir, posture, journal, suiteRoot),
    AdoSourceLive(rootDir, suiteRoot),
    ExecutionScenarioRunnerLive,
    ExecutionContextLive(posture),
  );
