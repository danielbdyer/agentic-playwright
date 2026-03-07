import path from 'path';
import { Effect } from 'effect';
import { FileSystemPort } from './ports';
import { TesseractError } from '../domain/errors';

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
    const matches: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      if (entry.includes('.')) {
        matches.push(fullPath);
      } else {
        const nested = yield* walkFiles(fs, fullPath);
        matches.push(...nested);
      }
    }

    return matches.sort((left, right) => left.localeCompare(right));
  });
}

