import path from 'node:path';
import { readJson } from '../core/fsio.js';
import { ToolError } from '../core/errors.js';

/**
 * The customer's repository is the product surface. Everything Tesseract
 * writes lives in it: tests, page objects, and flows at the top level where a
 * reviewer expects them, and memory, evidence, receipts, and handoffs under
 * `.tesseract/`.
 */
export interface WorkspaceConfig {
  readonly testsDir: string;
  readonly pagesDir: string;
  readonly flowsDir: string;
  /** Path (relative to root) of the customer's Playwright config, if any. */
  readonly playwrightConfig: string | null;
  /** standard: redact email/phone/long-number shapes; strict: also drop free text of non-label nodes; off: no redaction. */
  readonly pii: 'standard' | 'strict' | 'off';
  /** Passing runs after which a candidate facet referenced by a test is promoted to trusted. */
  readonly promoteAfterPasses: number;
  /** Locator health below this (with at least staleMinAttempts attempts) marks a facet stale. */
  readonly staleHealthFloor: number;
  readonly staleMinAttempts: number;
  readonly snapshotRetentionDays: number;
  readonly observe: {
    readonly maxCandidates: number;
    readonly maxAriaBytes: number;
    readonly hydrationBudgetMs: number;
  };
  readonly ado: {
    readonly orgUrl: string | null;
    readonly project: string | null;
    /** Environment variable holding the personal access token. */
    readonly patEnv: string;
  };
  /** Appended to the browser user agent so site owners can see who is visiting. */
  readonly userAgentSuffix: string;
}

export const DEFAULT_CONFIG: WorkspaceConfig = {
  testsDir: 'tests',
  pagesDir: 'pages',
  flowsDir: 'flows',
  playwrightConfig: null,
  pii: 'standard',
  promoteAfterPasses: 3,
  staleHealthFloor: 0.5,
  staleMinAttempts: 4,
  snapshotRetentionDays: 14,
  observe: { maxCandidates: 200, maxAriaBytes: 32 * 1024, hydrationBudgetMs: 20_000 },
  ado: { orgUrl: null, project: null, patEnv: 'AZURE_DEVOPS_PAT' },
  userAgentSuffix: 'tesseract-qa/2 (+qa-authoring)',
};

export interface WorkspacePaths {
  readonly root: string;
  readonly tests: string;
  readonly pages: string;
  readonly flows: string;
  readonly dot: string;
  readonly configFile: string;
  readonly profiles: string;
  readonly catalog: string;
  readonly evidence: string;
  readonly snapshots: string;
  readonly receipts: string;
  readonly handoffs: string;
  readonly cases: string;
  readonly recordings: string;
  readonly repair: string;
  readonly tmp: string;
  readonly authoringReceipts: string;
  readonly runReceipts: string;
  readonly reviewReceipts: string;
  readonly publishReceipts: string;
  readonly emitRecords: string;
}

export interface Workspace {
  readonly paths: WorkspacePaths;
  readonly config: WorkspaceConfig;
}

export const workspacePaths = (root: string, config: WorkspaceConfig = DEFAULT_CONFIG): WorkspacePaths => {
  const absRoot = path.resolve(root);
  const dot = path.join(absRoot, '.tesseract');
  const receipts = path.join(dot, 'receipts');
  return {
    root: absRoot,
    tests: path.join(absRoot, config.testsDir),
    pages: path.join(absRoot, config.pagesDir),
    flows: path.join(absRoot, config.flowsDir),
    dot,
    configFile: path.join(dot, 'config.json'),
    profiles: path.join(dot, 'profiles'),
    catalog: path.join(dot, 'catalog'),
    evidence: path.join(dot, 'evidence'),
    snapshots: path.join(dot, 'snapshots'),
    receipts,
    handoffs: path.join(dot, 'handoffs'),
    cases: path.join(dot, 'cases'),
    recordings: path.join(dot, 'flows'),
    repair: path.join(dot, 'repair'),
    tmp: path.join(dot, 'tmp'),
    authoringReceipts: path.join(receipts, 'authoring.jsonl'),
    runReceipts: path.join(receipts, 'runs.jsonl'),
    reviewReceipts: path.join(receipts, 'reviews.jsonl'),
    publishReceipts: path.join(receipts, 'publish.jsonl'),
    emitRecords: path.join(receipts, 'emits.jsonl'),
  };
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends readonly unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

export const mergeConfig = (base: WorkspaceConfig, override: DeepPartial<WorkspaceConfig>): WorkspaceConfig => ({
  ...base,
  ...Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined && (typeof v !== 'object' || v === null))),
  observe: { ...base.observe, ...(override.observe ?? {}) },
  ado: { ...base.ado, ...(override.ado ?? {}) },
} as WorkspaceConfig);

/** Load `.tesseract/config.json` (optional) and environment overrides. */
export const loadWorkspace = async (root: string, env: NodeJS.ProcessEnv = process.env): Promise<Workspace> => {
  const provisional = workspacePaths(root);
  const fileConfig = (await readJson<DeepPartial<WorkspaceConfig>>(provisional.configFile)) ?? {};
  const envConfig: DeepPartial<WorkspaceConfig> = {
    ado: {
      ...(env.AZURE_DEVOPS_ORG_URL ? { orgUrl: env.AZURE_DEVOPS_ORG_URL } : {}),
      ...(env.AZURE_DEVOPS_PROJECT ? { project: env.AZURE_DEVOPS_PROJECT } : {}),
    },
    ...(env.TESSERACT_PII === 'standard' || env.TESSERACT_PII === 'strict' || env.TESSERACT_PII === 'off'
      ? { pii: env.TESSERACT_PII }
      : {}),
  };
  const config = mergeConfig(mergeConfig(DEFAULT_CONFIG, fileConfig), envConfig);
  return { paths: workspacePaths(root, config), config };
};

/** Resolve a user-supplied relative path and refuse anything that escapes the workspace root. */
export const resolveInside = (workspace: Workspace, relativeOrAbsolute: string): string => {
  const resolved = path.resolve(workspace.paths.root, relativeOrAbsolute);
  const rootWithSep = workspace.paths.root.endsWith(path.sep) ? workspace.paths.root : `${workspace.paths.root}${path.sep}`;
  if (resolved !== workspace.paths.root && !resolved.startsWith(rootWithSep)) {
    throw new ToolError('invalid-input', `path escapes the workspace root: ${relativeOrAbsolute}`);
  }
  return resolved;
};
