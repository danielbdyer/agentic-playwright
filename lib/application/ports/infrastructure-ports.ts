import { Context, Effect } from 'effect';
import type { TesseractError } from '../../domain/errors';
import type { AdoId } from '../../domain/identity';
import type { PipelineConfig } from '../../domain/types';

export interface FileSystemPort {
  readText(path: string): Effect.Effect<string, TesseractError>;
  writeText(path: string, contents: string): Effect.Effect<void, TesseractError>;
  readJson(path: string): Effect.Effect<unknown, TesseractError>;
  writeJson(path: string, value: unknown): Effect.Effect<void, TesseractError>;
  stat(path: string): Effect.Effect<{ readonly mtimeMs: number }, TesseractError>;
  exists(path: string): Effect.Effect<boolean, TesseractError>;
  removeFile(path: string): Effect.Effect<void, TesseractError>;
  listDir(path: string): Effect.Effect<string[], TesseractError>;
  ensureDir(path: string): Effect.Effect<void, TesseractError>;
  removeDir(path: string): Effect.Effect<void, TesseractError>;
}

export interface AdoSourcePort {
  listSnapshotIds(): Effect.Effect<AdoId[], TesseractError>;
  loadSnapshot(adoId: AdoId): Effect.Effect<unknown, TesseractError>;
}

export class FileSystem extends Context.Tag('tesseract/FileSystem')<FileSystem, FileSystemPort>() {}
export class AdoSource extends Context.Tag('tesseract/AdoSource')<AdoSource, AdoSourcePort>() {}
export class PipelineConfigService extends Context.Tag('tesseract/PipelineConfig')<PipelineConfigService, { readonly config: PipelineConfig }>() {}
