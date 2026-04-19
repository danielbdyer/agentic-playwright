import type { RefPath } from '../intent/types';

const PATH_SEPARATOR = '.';

export function createRefPath(...segments: string[]): RefPath {
  return {
    segments: segments.filter((segment) => segment.length > 0),
  };
}

export function parseRefPath(path: string): RefPath {
  return createRefPath(...path.split(PATH_SEPARATOR));
}

export function formatRefPath(path: RefPath): string {
  return path.segments.join(PATH_SEPARATOR);
}
