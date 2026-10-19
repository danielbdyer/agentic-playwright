/**
 * Emission on disk: read what is there, merge, write what changed. All
 * merges are computed before anything is written, so a conflict in one file
 * leaves every file untouched.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Facet } from '../contract/schemas.js';
import { ToolError } from '../core/errors.js';
import { escapeRegExp } from '../core/text.js';
import { readText, relativePosix, writeFileAtomic } from '../core/fsio.js';
import type { Workspace } from '../workspace/workspace.js';
import { resolveInside } from '../workspace/workspace.js';
import { unifiedDiff } from './diff.js';
import { renderFlow } from './flow.js';
import { HAND_EDIT_MESSAGE, mergeTexts, sameGeneratedContent } from './keep.js';
import { normalizeRelativePath, overridesPath, safeAdoId } from './naming.js';
import { renderPageObject } from './page-object.js';
import { renderSpec } from './spec.js';
import type { EmitLayout, RenderedFile, RenderedFlow, RenderedPageObject, RenderedSpec, ScreenCatalog, SpecInput } from './types.js';
import { normalizeNewlines } from './writer.js';

/** The emission layout configured for a workspace (tests/, pages/, flows/ by default). */
export const layoutOf = (workspace: Workspace): EmitLayout => ({
  testsDir: workspace.config.testsDir,
  pagesDir: workspace.config.pagesDir,
  flowsDir: workspace.config.flowsDir,
});

const SKIP_DIRS = new Set(['node_modules', '.git', '.tesseract', 'test-results', 'playwright-report', 'dist']);

const walkFiles = async (dir: string): Promise<readonly string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw error;
  });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) || entry.name.startsWith('.') ? [] : walkFiles(full);
      return entry.isFile() ? [full] : [];
    }),
  );
  return nested.flat();
};

/**
 * The existing spec for an ADO id anywhere under the tests directory
 * (`<adoId>-*.spec.ts`; the hyphen keeps 10001 from matching 100011), as a
 * workspace-relative POSIX path, or null. Two matches is a conflict: a human
 * must decide which one is the test.
 */
export const locateSpec = async (workspace: Workspace, adoId: string): Promise<string | null> => {
  const pattern = new RegExp(`^${escapeRegExp(safeAdoId(adoId))}-.+\\.spec\\.ts$`);
  const testsRoot = resolveInside(workspace, normalizeRelativePath(workspace.config.testsDir, 'testsDir'));
  const matches = (await walkFiles(testsRoot))
    .filter((file) => pattern.test(path.basename(file)))
    .map((file) => relativePosix(workspace.paths.root, file))
    .sort();
  if (matches.length > 1) {
    throw new ToolError('conflict', `more than one spec exists for ADO ${adoId}: ${matches.join(', ')}; delete or rename all but one`, { paths: matches });
  }
  return matches[0] ?? null;
};

/** Contents of pages/<screen>.page.overrides.ts, or null when the screen has none. */
export const loadOverrides = async (workspace: Workspace, screen: string): Promise<string | null> =>
  readText(resolveInside(workspace, overridesPath(screen, layoutOf(workspace))));

export interface EmitFilesInput {
  readonly spec?: RenderedSpec | RenderedFile;
  readonly pageObjects: readonly RenderedFile[];
  readonly flows: readonly RenderedFile[];
}

export interface EmitFilesOptions {
  /** Compute the merge and the diff, write nothing. */
  readonly dryRun?: boolean;
  /** Overwrite edits made outside keep regions (they are discarded; keep regions still survive). */
  readonly force?: boolean;
}

export interface EmittedFile {
  readonly path: string;
  readonly status: 'created' | 'updated' | 'unchanged';
  readonly handEdited: boolean;
  readonly orphaned: readonly string[];
}

export interface EmitFilesResult {
  /** Paths written by this call (empty on a dry run). Workspace-relative POSIX. */
  readonly written: readonly string[];
  /** Paths whose content differs from disk (what a non-dry run writes). */
  readonly changed: readonly string[];
  /** Unified diff of every changed file against disk. */
  readonly diff: string;
  /** Kept code that lost its place and was appended as an orphaned block, per file. */
  readonly orphaned: readonly { readonly path: string; readonly keys: readonly string[] }[];
  readonly files: readonly EmittedFile[];
}

interface Planned {
  readonly path: string;
  readonly absolute: string;
  readonly existing: string | null;
  readonly text: string;
  readonly changed: boolean;
  readonly handEdited: boolean;
  readonly orphaned: readonly string[];
  readonly diff: string;
}

const isRenderedSpec = (file: RenderedSpec | RenderedFile): file is RenderedSpec => 'adoId' in file;

/** Keep the existing file's line endings and byte-order mark. */
const inExistingStyle = (text: string, existing: string | null): string => {
  if (existing === null) return text;
  const bom = existing.startsWith('\uFEFF') ? '\uFEFF' : '';
  const crlf = /\r\n/.test(existing) && !/(^|[^\r])\n/.test(existing);
  return `${bom}${crlf ? text.replace(/\n/g, '\r\n') : text}`;
};

/**
 * Merge each rendered file with what is on disk and write the ones that
 * changed (atomically, in the existing file's line-ending style).
 *
 * Throws `conflict` (writing nothing) when a file was edited outside keep
 * regions and `force` is not set — detail carries the paths and the diff that
 * force would apply — or when a spec for the same ADO id already exists at a
 * different path (render with `path` from locateSpec). Throws `invalid-input`
 * for paths outside the workspace or listed twice.
 */
export const emitFiles = async (workspace: Workspace, input: EmitFilesInput, options: EmitFilesOptions = {}): Promise<EmitFilesResult> => {
  const files: readonly RenderedFile[] = [...(input.spec === undefined ? [] : [input.spec]), ...input.pageObjects, ...input.flows];
  const paths = files.map((file) => normalizeRelativePath(file.path, 'emitted path'));
  const duplicate = paths.find((p, i) => paths.indexOf(p) !== i);
  if (duplicate !== undefined) throw new ToolError('invalid-input', `${duplicate} is emitted twice in one call`);

  if (input.spec !== undefined && isRenderedSpec(input.spec)) {
    const existingSpec = await locateSpec(workspace, input.spec.adoId);
    if (existingSpec !== null && existingSpec !== normalizeRelativePath(input.spec.path, 'spec path')) {
      throw new ToolError('conflict', `ADO ${input.spec.adoId} already has a spec at ${existingSpec}; render with path: ${JSON.stringify(existingSpec)} to keep it there`, {
        existing: existingSpec,
        rendered: input.spec.path,
      });
    }
  }

  const planned = await Promise.all(
    files.map(async (file, i): Promise<Planned> => {
      const relative = paths[i]!;
      const absolute = resolveInside(workspace, relative);
      const existing = await readText(absolute);
      const merged = mergeTexts(file.text, existing);
      const changed = existing === null || !sameGeneratedContent(existing, merged.text);
      return {
        path: relative,
        absolute,
        existing,
        text: merged.text,
        changed,
        handEdited: merged.handEdited,
        orphaned: merged.orphaned,
        diff: changed ? unifiedDiff(existing === null ? null : normalizeNewlines(existing), merged.text, relative) : '',
      };
    }),
  );

  const edited = planned.filter((plan) => plan.handEdited && plan.changed);
  if (edited.length > 0 && options.force !== true) {
    throw new ToolError('conflict', `${edited.map((plan) => plan.path).join(', ')}: ${HAND_EDIT_MESSAGE}`, {
      handEdited: edited.map((plan) => plan.path),
      diff: edited.map((plan) => plan.diff).join(''),
    });
  }

  const toWrite = planned.filter((plan) => plan.changed);
  if (options.dryRun !== true) {
    await Promise.all(toWrite.map((plan) => writeFileAtomic(plan.absolute, inExistingStyle(plan.text, plan.existing))));
  }
  return {
    written: options.dryRun === true ? [] : toWrite.map((plan) => plan.path),
    changed: toWrite.map((plan) => plan.path),
    diff: toWrite.map((plan) => plan.diff).join(''),
    orphaned: planned.filter((plan) => plan.orphaned.length > 0).map((plan) => ({ path: plan.path, keys: plan.orphaned })),
    files: planned.map((plan) => ({
      path: plan.path,
      status: !plan.changed ? 'unchanged' : plan.existing === null ? 'created' : 'updated',
      handEdited: plan.handEdited,
      orphaned: plan.orphaned,
    })),
  };
};

export interface EmitTestInput extends Omit<SpecInput, 'path' | 'layout'> {
  /** Also catalogs for every screen the flows touch. */
  readonly catalogs: readonly ScreenCatalog[];
}

export interface EmitTestResult extends EmitFilesResult {
  readonly spec: RenderedSpec;
  readonly pageObjects: readonly RenderedPageObject[];
  readonly flowFiles: readonly RenderedFlow[];
}

/**
 * The whole of test.emit after facets are minted: keep the spec's sticky
 * path, render the spec, the page objects of every screen the spec and its
 * flows use (honouring overrides files), and the flows, then emitFiles.
 */
export const emitTest = async (workspace: Workspace, input: EmitTestInput, options: EmitFilesOptions = {}): Promise<EmitTestResult> => {
  const layout = layoutOf(workspace);
  const sticky = await locateSpec(workspace, input.testCase.id);
  const spec = renderSpec({ ...input, layout, ...(sticky === null ? {} : { path: sticky }) });
  const catalogs = new Map(input.catalogs.map((catalog) => [catalog.screen, catalog]));
  const allFacets = new Map<string, Facet>(input.catalogs.flatMap((catalog) => catalog.facets.map((facet) => [facet.id, facet] as const)));
  const routes = new Map(input.catalogs.map((catalog) => [catalog.screen, catalog.route]));
  const flowFiles = (input.flows ?? []).map((use) => {
    const screens = new Set(use.recording.steps.flatMap((step) => [step.screen, ...(step.facetId === undefined ? [] : [allFacets.get(step.facetId)?.screen ?? step.screen])]));
    const facets = new Map([...allFacets].filter(([, facet]) => screens.has(facet.screen)));
    return renderFlow(use.recording, facets, routes, { layout });
  });
  const screens = [...new Set([...spec.screens, ...flowFiles.flatMap((flow) => flow.screens)])];
  const pageObjects = await Promise.all(
    screens.map(async (screen) => {
      const catalog = catalogs.get(screen);
      if (catalog === undefined) throw new ToolError('not-found', `no catalog was passed for screen ${screen}`, { screen });
      return renderPageObject(screen, catalog.route, catalog.facets, await loadOverrides(workspace, screen), { layout });
    }),
  );
  const result = await emitFiles(workspace, { spec, pageObjects, flows: flowFiles }, options);
  return { ...result, spec, pageObjects, flowFiles };
};
