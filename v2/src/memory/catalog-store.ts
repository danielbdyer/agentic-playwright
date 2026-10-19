/**
 * Catalog files on disk. These functions do no locking; the service wraps
 * every read-modify-write in the per-file lock. A catalog that does not
 * exist yet reads as an empty one; writing skips the disk when the bytes
 * would not change, so reads never touch a file's mtime or the git diff.
 */
import path from 'node:path';
import { listFiles, readText, writeFileAtomic } from '../core/fsio.js';
import { relativePosix } from '../core/fsio.js';
import type { Workspace } from '../workspace/workspace.js';
import { assertScreenName, isSlug } from './ids.js';
import { parseCatalogYaml, serializeCatalog } from './catalog-yaml.js';
import type { ScreenCatalog } from './types.js';

export const catalogFile = (ws: Workspace, screen: string): string => path.join(ws.paths.catalog, `${assertScreenName(screen)}.yaml`);

/** Screens with a catalog file, sorted. Files whose names are not screen names (e.g. `_shared.yaml`) are not screens. */
export const listScreens = async (ws: Workspace): Promise<readonly string[]> =>
  (await listFiles(ws.paths.catalog, '.yaml')).map((file) => path.basename(file, '.yaml')).filter(isSlug);

export interface ScreenFile {
  readonly screen: string;
  readonly file: string;
  readonly exists: boolean;
  /** The file's text as read, for change detection on save. */
  readonly text: string | null;
  readonly catalog: ScreenCatalog;
  readonly warnings: readonly string[];
}

export const readScreenFile = async (ws: Workspace, screen: string): Promise<ScreenFile> => {
  const file = catalogFile(ws, screen);
  const text = await readText(file);
  if (text === null) return { screen, file, exists: false, text: null, catalog: { screen, facets: [] }, warnings: [] };
  const { catalog, warnings } = parseCatalogYaml(text, relativePosix(ws.paths.root, file), screen);
  return { screen, file, exists: true, text, catalog, warnings };
};

/** Write the catalog atomically unless the file already holds exactly these bytes. Returns whether it wrote. */
export const writeScreenFile = async (ws: Workspace, catalog: ScreenCatalog, previousText: string | null): Promise<boolean> => {
  const text = serializeCatalog(catalog);
  if (text === previousText) return false;
  await writeFileAtomic(catalogFile(ws, catalog.screen), text);
  return true;
};
