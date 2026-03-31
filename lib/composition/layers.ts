import { Layer } from 'effect';
import { AdoSource, ExecutionContext, FileSystem, ResolutionEngineResolver, RuntimeScenarioRunner } from '../application/ports';
import { createResolutionEngineRegistry, resolveResolutionEngine } from '../application/resolution-engine';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createRecordingWorkspaceFileSystem } from '../infrastructure/fs/recording-fs';
import { LocalRuntimeScenarioRunner } from './local-runtime-scenario-runner';
import type { ExecutionPosture, WriteJournalEntry } from '../domain/types';
import { deterministicResolutionEngine } from '../runtime/agent';

export const FileSystemLive = Layer.succeed(FileSystem, LocalFileSystem);

export const AdoSourceLive = (rootDir: string, suiteRoot?: string) =>
  Layer.succeed(AdoSource, makeLocalAdoSource(rootDir, suiteRoot));

export const RuntimeScenarioRunnerLive =
  Layer.succeed(RuntimeScenarioRunner, LocalRuntimeScenarioRunner);

const resolutionEngineRegistry = createResolutionEngineRegistry([deterministicResolutionEngine]);
export const ResolutionEngineResolverLive =
  Layer.succeed(ResolutionEngineResolver, {
    resolve: (input: { providerId?: string | null | undefined; mode: 'diagnostic' | 'playwright' | 'dry-run'; translationEnabled: boolean }) =>
      resolveResolutionEngine({ ...input, registry: resolutionEngineRegistry }),
  });

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
    ResolutionEngineResolverLive,
    ExecutionContextLive(posture),
  );
