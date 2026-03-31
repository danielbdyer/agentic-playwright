import { Context, Effect } from 'effect';
import type { TesseractError } from '../../domain/errors';

export interface VersionControlPort {
  currentRevision(): Effect.Effect<string, TesseractError>;
  restoreToHead(paths: readonly string[]): Effect.Effect<void, TesseractError>;
}

export class VersionControl extends Context.Tag('tesseract/VersionControl')<VersionControl, VersionControlPort>() {}
