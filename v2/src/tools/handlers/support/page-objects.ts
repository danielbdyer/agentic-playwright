/**
 * Page objects are a projection of the catalog. When memory changes a
 * screen's facets (mint, enrich) and pages/<screen>.page.ts already exists,
 * it is regenerated from the catalog right away, honouring the screen's
 * overrides file and tesseract:keep regions, so a repair in place closes
 * with enrich → test.run and no separate emit. A screen that has never been
 * emitted gets no page object here; test.emit creates it.
 */
import { isToolError } from '../../../core/errors.js';
import { exists } from '../../../core/fsio.js';
import { emitFiles, layoutOf, loadOverrides, pageObjectPath, renderPageObject } from '../../../emit/index.js';
import { loadScreen } from '../../../memory/index.js';
import { resolveInside, type Workspace } from '../../../workspace/workspace.js';

export type Regeneration =
  | { readonly status: 'absent'; readonly path: string }
  | { readonly status: 'unchanged'; readonly path: string }
  | { readonly status: 'regenerated'; readonly path: string; readonly orphaned: readonly string[] }
  | { readonly status: 'skipped'; readonly path: string; readonly reason: string };

/**
 * Every write of a page object (memory's regeneration, test.emit, flow.record)
 * runs in its screen's queue, one at a time, each loading and rendering the
 * catalog when its turn comes: concurrent mints and emits then end with a
 * file rendered from the latest catalog, never one rendered from an older
 * catalog and written last.
 */
const queues = new Map<string, Promise<unknown>>();

const keyOf = (workspace: Workspace, screen: string): string => `${workspace.paths.root}\u0000${screen}`;

/**
 * Run `task` once every earlier task queued on any of these screens has
 * settled, and hold those screens until it settles. The tails are taken and
 * replaced synchronously, so tasks wait only on tasks queued before them
 * (no cycle, whatever the screens' order).
 */
export const withPageObjects = <T>(workspace: Workspace, screens: readonly string[], task: () => Promise<T>): Promise<T> => {
  const keys = [...new Set(screens.map((screen) => keyOf(workspace, screen)))];
  const previous = Promise.all(keys.map((key) => queues.get(key) ?? Promise.resolve()));
  const run = previous.then(task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  for (const key of keys) queues.set(key, settled);
  void settled.then(() => {
    for (const key of keys) if (queues.get(key) === settled) queues.delete(key);
  });
  return run;
};

/** Regenerate pages/<screen>.page.ts from the catalog when it exists. Never throws for emission problems; reports them. */
export const regeneratePageObject = (workspace: Workspace, screen: string, now?: () => Date): Promise<Regeneration> =>
  withPageObjects(workspace, [screen], () => regenerate(workspace, screen, now));

const regenerate = async (workspace: Workspace, screen: string, now?: () => Date): Promise<Regeneration> => {
  const layout = layoutOf(workspace);
  const relative = pageObjectPath(screen, layout);
  if (!(await exists(resolveInside(workspace, relative)))) return { status: 'absent', path: relative };
  try {
    const loaded = await loadScreen(workspace, screen, now !== undefined ? { now } : {});
    const rendered = renderPageObject(screen, loaded.catalog.route ?? null, loaded.catalog.facets, await loadOverrides(workspace, screen), { layout });
    const result = await emitFiles(workspace, { pageObjects: [rendered], flows: [] });
    if (result.changed.length === 0) return { status: 'unchanged', path: relative };
    return { status: 'regenerated', path: relative, orphaned: result.orphaned.flatMap((entry) => entry.keys) };
  } catch (error) {
    const reason = isToolError(error) ? `${error.family}: ${error.message}` : error instanceof Error ? error.message : String(error);
    return { status: 'skipped', path: relative, reason };
  }
};

/** The line memory.enrich adds to its changes list, or null when there is nothing to say. */
export const regenerationNote = (regeneration: Regeneration): string | null => {
  switch (regeneration.status) {
    case 'regenerated':
      return regeneration.orphaned.length > 0
        ? `regenerated ${regeneration.path} (kept code orphaned: ${regeneration.orphaned.join(', ')})`
        : `regenerated ${regeneration.path}`;
    case 'skipped':
      return `${regeneration.path} not regenerated (${regeneration.reason}); run test.emit with force to rewrite it`;
    case 'unchanged':
    case 'absent':
      return null;
    default: {
      const never: never = regeneration;
      return never;
    }
  }
};
