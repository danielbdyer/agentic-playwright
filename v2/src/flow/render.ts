/**
 * A recording on disk and as code: write .tesseract/flows/<name>.json, then
 * render flows/<name>.ts and the page objects of every screen it touches
 * with the emission library, and write them (keep regions and overrides
 * files survive, hand edits outside them are a conflict).
 */
import type { Facet, FlowRecordingSpec } from '../contract/schemas.js';
import { ToolError, isToolError } from '../core/errors.js';
import { relativePosix } from '../core/fsio.js';
import { emitFiles, layoutOf, loadOverrides, renderFlow, renderPageObject, type EmitRoute, type ScreenCatalog as EmitCatalog } from '../emit/index.js';
import { contractRoute, loadScreen, type CatalogRoute, type MemoryOptions } from '../memory/index.js';
import type { Workspace } from '../workspace/workspace.js';
import { saveRecording } from './recording.js';

/** A catalog route as emission takes it: the contract route plus the landmarks goto() waits on. */
export const emitRouteOf = (route: CatalogRoute | undefined): EmitRoute | null => {
  if (route === undefined) return null;
  const landmarks = route.landmarks ?? route.summary?.landmarks;
  return { ...contractRoute(route), ...(landmarks !== undefined && landmarks.length > 0 ? { landmarks: [...landmarks] } : {}) };
};

/** The screens a recording touches, in first-use order. */
export const screensOf = (recording: FlowRecordingSpec, facetScreen: (facetId: string) => string | undefined = () => undefined): readonly string[] => [
  ...new Set(recording.steps.flatMap((step) => [step.screen, ...(step.facetId !== undefined ? [facetScreen(step.facetId) ?? step.screen] : [])])),
];

/** Load the emission view of each screen's catalog. */
export const emitCatalogs = async (workspace: Workspace, screens: readonly string[], options: MemoryOptions = {}): Promise<readonly EmitCatalog[]> =>
  Promise.all(
    screens.map(async (screen) => {
      const loaded = await loadScreen(workspace, screen, options);
      return { screen, route: emitRouteOf(loaded.catalog.route), facets: loaded.catalog.facets };
    }),
  );

export interface PersistedFlow {
  /** Workspace-relative paths. */
  readonly recordingPath: string;
  readonly flowPath: string;
  readonly pageObjectPaths: readonly string[];
  /** Files this call wrote (unchanged files are not rewritten). */
  readonly written: readonly string[];
  readonly diff: string;
  readonly orphaned: readonly { readonly path: string; readonly keys: readonly string[] }[];
  readonly facetsUsed: readonly string[];
}

export interface PersistOptions extends MemoryOptions {
  /** Regenerate over hand edits made outside keep regions. */
  readonly force?: boolean;
}

/**
 * Write the recording, then flows/<name>.ts and pages/<screen>.page.ts for
 * the screens it uses. A hand-edited flow or page object is a conflict; the
 * recording is written first either way, so the message says where it is.
 */
export const persistFlow = async (workspace: Workspace, recording: FlowRecordingSpec, options: PersistOptions = {}): Promise<PersistedFlow> => {
  const recordingFile = await saveRecording(workspace, recording);
  const recordingPath = relativePosix(workspace.paths.root, recordingFile);
  const layout = layoutOf(workspace);
  const stepScreens = screensOf(recording);
  const catalogs = await emitCatalogs(workspace, stepScreens, options);
  const facetScreens = new Map(catalogs.flatMap((catalog) => catalog.facets.map((facet) => [facet.id, facet.screen] as const)));
  // A facet minted on another screen than the step's (a reused facet) brings its screen along.
  const extra = screensOf(recording, (id) => facetScreens.get(id) ?? id.split(':')[0]).filter((screen) => !stepScreens.includes(screen));
  const all = extra.length === 0 ? catalogs : [...catalogs, ...(await emitCatalogs(workspace, extra, options))];
  const facetsById = new Map<string, Facet>(all.flatMap((catalog) => catalog.facets.map((facet) => [facet.id, facet] as const)));
  const routes = new Map(all.map((catalog) => [catalog.screen, catalog.route] as const));
  const flow = renderFlow(recording, facetsById, routes, { layout });
  const byScreen = new Map(all.map((catalog) => [catalog.screen, catalog] as const));
  const pageObjects = await Promise.all(
    flow.screens.map(async (screen) => {
      const catalog = byScreen.get(screen);
      return renderPageObject(screen, catalog?.route ?? null, catalog?.facets ?? [], await loadOverrides(workspace, screen), { layout });
    }),
  );
  try {
    const emitted = await emitFiles(workspace, { pageObjects, flows: [flow] }, options.force === true ? { force: true } : {});
    return {
      recordingPath,
      flowPath: flow.path,
      pageObjectPaths: pageObjects.map((page) => page.path),
      written: emitted.written,
      diff: emitted.diff,
      orphaned: emitted.orphaned,
      facetsUsed: flow.facetsUsed,
    };
  } catch (error) {
    if (isToolError(error) && error.family === 'conflict') {
      throw new ToolError('conflict', `${error.message} (the recording was saved to ${recordingPath}; flows/${recording.name}.ts was not regenerated)`, {
        ...(error.detail ?? {}),
        recordingPath,
      });
    }
    throw error;
  }
};
