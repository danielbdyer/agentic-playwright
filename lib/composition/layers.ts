import { Layer } from 'effect';
import {
  AdoSource,
  ApplicationInterfaceGraphStore,
  ExecutionContext,
  FileSystem,
  ImprovementRunStore,
  InterventionLedgerStore,
  RuntimeScenarioRunner,
} from '../application/ports';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createRecordingWorkspaceFileSystem } from '../infrastructure/fs/recording-fs';
import { LocalApplicationInterfaceGraphRepository } from '../infrastructure/repositories/local-application-interface-graph-repository';
import { LocalImprovementRunRepository } from '../infrastructure/repositories/local-improvement-run-repository';
import { LocalInterventionLedgerRepository } from '../infrastructure/repositories/local-intervention-ledger-repository';
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
  Layer.mergeAll(
    RecordingFileSystemLive(rootDir, posture, journal, suiteRoot),
    AdoSourceLive(rootDir, suiteRoot),
    RuntimeScenarioRunnerLive,
    ExecutionContextLive(posture),
    Layer.succeed(ApplicationInterfaceGraphStore, LocalApplicationInterfaceGraphRepository),
    Layer.succeed(InterventionLedgerStore, LocalInterventionLedgerRepository),
    Layer.succeed(ImprovementRunStore, LocalImprovementRunRepository),
  );
