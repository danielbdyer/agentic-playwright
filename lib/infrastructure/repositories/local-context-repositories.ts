import { Effect } from 'effect';
import YAML from 'yaml';
import type { AdoId, ScreenId } from '../../domain/identity';
import type { TesseractError } from '../../domain/errors';
import type {
  ControlRepositoryPort,
  ExecutionRepositoryPort,
  FileSystemPort,
  GovernanceRepositoryPort,
  IntentRepositoryPort,
  KnowledgeRepositoryPort,
  ResolutionTaskRepositoryPort,
} from '../../application/ports';
import type { ProjectPaths } from '../../application/paths';
import {
  datasetControlPath,
  elementsPath,
  executionPath,
  generatedProposalsPath,
  hintsPath,
  interpretationPath,
  resolutionControlPath,
  resolutionGraphPath,
  runRecordPath,
  runbookPath,
  snapshotPath,
  taskPacketPath,
} from '../../application/paths';

function parseYamlDocument(text: string): Record<string, unknown> {
  const parsed = YAML.parse(text);
  return (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
}

function writeJsonBatch(
  fs: FileSystemPort,
  writes: ReadonlyArray<readonly [path: string, value: unknown]>,
): Effect.Effect<void, TesseractError> {
  return Effect.all(writes.map(([filePath, value]) => fs.writeJson(filePath, value)), { concurrency: 'unbounded' }).pipe(Effect.asVoid);
}

export function makeLocalIntentRepository(paths: ProjectPaths, fs: FileSystemPort): IntentRepositoryPort {
  return {
    readSnapshot: (adoId: AdoId) => fs.readJson(snapshotPath(paths, adoId)),
    writeSnapshot: (adoId: AdoId, snapshot: unknown) => fs.writeJson(snapshotPath(paths, adoId), snapshot),
    readManifest: () => fs.readJson(paths.intent.manifestPath),
    writeManifest: (manifest: unknown) => fs.writeJson(paths.intent.manifestPath, manifest),
  };
}

export function makeLocalKnowledgeRepository(paths: ProjectPaths, fs: FileSystemPort): KnowledgeRepositoryPort {
  return {
    readScreenElements: (screen: ScreenId) => fs.readText(elementsPath(paths, screen)).pipe(Effect.map(parseYamlDocument)),
    writeScreenElements: (screen: ScreenId, document: Record<string, unknown>) =>
      fs.writeText(elementsPath(paths, screen), YAML.stringify(document)),
    readScreenHints: (screen: ScreenId) => fs.readText(hintsPath(paths, screen)).pipe(Effect.map(parseYamlDocument)),
    writeScreenHints: (screen: ScreenId, document: Record<string, unknown>) =>
      fs.writeText(hintsPath(paths, screen), YAML.stringify(document)),
  };
}

export function makeLocalControlRepository(paths: ProjectPaths, fs: FileSystemPort): ControlRepositoryPort {
  return {
    readDataset: (name: string) => fs.readText(datasetControlPath(paths, name)).pipe(Effect.map((text) => YAML.parse(text))),
    readResolutionControl: (name: string) => fs.readText(resolutionControlPath(paths, name)).pipe(Effect.map((text) => YAML.parse(text))),
    readRunbook: (name: string) => fs.readText(runbookPath(paths, name)).pipe(Effect.map((text) => YAML.parse(text))),
  };
}

export function makeLocalResolutionTaskRepository(paths: ProjectPaths, fs: FileSystemPort): ResolutionTaskRepositoryPort {
  return {
    readTaskPacket: (adoId: AdoId) => fs.readJson(taskPacketPath(paths, adoId)),
    writeTaskPacket: (adoId: AdoId, packet: unknown) => fs.writeJson(taskPacketPath(paths, adoId), packet),
  };
}

export function makeLocalExecutionRepository(paths: ProjectPaths, fs: FileSystemPort): ExecutionRepositoryPort {
  return {
    writeRunArtifacts: (input) => {
      const interpretationFile = interpretationPath(paths, input.adoId, input.runId);
      const executionFile = executionPath(paths, input.adoId, input.runId);
      const resolutionGraphFile = resolutionGraphPath(paths, input.adoId, input.runId);
      const runFile = runRecordPath(paths, input.adoId, input.runId);
      const proposalsFile = generatedProposalsPath(paths, input.suite, input.adoId);

      return writeJsonBatch(fs, [
        [interpretationFile, input.interpretation],
        [executionFile, input.execution],
        [resolutionGraphFile, input.resolutionGraph],
        [runFile, input.runRecord],
        [proposalsFile, input.proposalBundle],
      ]).pipe(Effect.as({
        interpretationPath: interpretationFile,
        executionPath: executionFile,
        resolutionGraphPath: resolutionGraphFile,
        runPath: runFile,
        proposalsPath: proposalsFile,
      }));
    },
  };
}

export function makeLocalGovernanceRepository(paths: ProjectPaths, fs: FileSystemPort): GovernanceRepositoryPort {
  return {
    writeGraphIndex: (graph: unknown) => fs.writeJson(paths.governance.graphIndexPath, graph),
    writeMcpCatalog: (catalog: unknown) => fs.writeJson(paths.governance.mcpCatalogPath, catalog),
  };
}
