import path from 'path';
import { Effect } from 'effect';
import type { FileSystemPort } from './ports';
import type { TesseractError } from '../domain/errors';

export function walkFiles(
  fs: FileSystemPort,
  dirPath: string,
): Effect.Effect<string[], TesseractError> {
  return Effect.gen(function* () {
    const exists = yield* fs.exists(dirPath);
    if (!exists) {
      return [];
    }

    const entries = yield* fs.listDir(dirPath);
    const nested = yield* Effect.all(
      entries.map((entry) => {
        const fullPath = path.join(dirPath, entry);
        return entry.includes('.')
          ? Effect.succeed([fullPath])
          : walkFiles(fs, fullPath);
      }),
      { concurrency: 1 },
    );

    return nested.flat().sort((left, right) => left.localeCompare(right));
  });
}

