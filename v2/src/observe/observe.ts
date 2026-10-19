/**
 * app.observe's engine: walk the page, gate PII, cap, fingerprint,
 * classify, and capture the browser's ARIA view of the same scope.
 *
 * Two shapes come out. The Snapshot (contract schema) is what the agent
 * sees: capped, scoped, redacted. The SnapshotRecord is what is saved to
 * .tesseract/snapshots/: every candidate of the scope (still redacted;
 * nothing unredacted is ever written), the categories and alerts needed
 * to diff two observations, and the fingerprint basis needed to explain
 * drift. memory.mint and handoffs cite records by snapshotId.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { ToolError } from '../core/errors.js';
import { newId } from '../core/hash.js';
import { redact, redactUrl, type PiiMode } from '../core/pii.js';
import {
  LandmarkRoleSchema,
  type AuditFinding,
  type Candidate,
  type LandmarkRole,
  type PageFingerprint,
  type Snapshot,
  type SnapshotDelta,
  type Variant,
} from '../contract/schemas.js';
import { DEFAULT_CONFIG } from '../workspace/workspace.js';
import { inPage } from './in-page/runtime.js';
import type { NodeCategory, PageSignals, VariantSignals, WalkNode, WalkResult, WalkScope, WalkStats } from './in-page/walker.js';
import { captureAria, capAriaText, nameAgreement, parseAriaSnapshot, type AriaCapture, type NameAgreement, type ObserveScope } from './aria.js';
import { buildFingerprint, fingerprintBasis, type FingerprintBasis } from './fingerprint.js';
import { classifyVariant, type VariantVerdict } from './variant.js';

export type { ObserveScope } from './aria.js';
export type { NodeCategory } from './in-page/walker.js';

export const SNAPSHOT_RECORD_VERSION = 1;

/** The full record saved to disk. Every string in it is already PII-gated. */
export interface SnapshotRecord {
  readonly version: typeof SNAPSHOT_RECORD_VERSION;
  readonly snapshotId: string;
  readonly pageId: string;
  readonly at: string;
  /** Page URL, query values and fragment redacted. */
  readonly url: string;
  readonly title: string;
  readonly variant: Variant;
  readonly variantEvidence: readonly string[];
  readonly variantSignals: VariantSignals;
  /** "page", a landmark role, or "block:<data-block>". */
  readonly scope: string;
  readonly fingerprint: PageFingerprint;
  readonly fingerprintBasis: FingerprintBasis;
  /** Every candidate in the scope, uncapped, in document order. */
  readonly candidates: readonly Candidate[];
  /** ref → why the element is a node (control, landmark, row, message, …). */
  readonly categories: Readonly<Record<string, NodeCategory>>;
  /** Text of alert / status / feedback-message nodes. */
  readonly alerts: readonly string[];
  /** ARIA snapshot text of the scope (capped at a larger size than the agent's copy). */
  readonly aria: string;
  readonly ariaTruncated: boolean;
  readonly nameAgreement: NameAgreement;
  readonly stats: WalkStats;
  readonly pii: PiiMode;
  readonly screenshotPath?: string;
}

export interface ObserveOptions {
  readonly pageId: string;
  readonly snapshotId?: string;
  /** "page" (default), a landmark role, or "block:<data-block>". */
  readonly scope?: string;
  readonly maxCandidates?: number;
  readonly maxAriaBytes?: number;
  readonly pii?: PiiMode;
  readonly includeScreenshot?: boolean;
  /** When set with includeScreenshot, the PNG is written to <screenshotDir>/<snapshotId>.png. */
  readonly screenshotDir?: string;
  /** Add testability findings to the snapshot. */
  readonly audit?: boolean;
  /** Budget for each container's ARIA snapshot (default 5000 ms); one that runs out is reported in the text and as truncated. */
  readonly ariaTimeoutMs?: number;
  readonly now?: () => Date;
}

export interface ObserveResult {
  readonly snapshot: Snapshot;
  readonly record: SnapshotRecord;
  /**
   * The observed document's address as the page reported it, not PII-gated:
   * for deriving a route (query and fragment dropped). Never write it as is.
   */
  readonly address: string;
  /** The PNG bytes when includeScreenshot was set (also written to disk when screenshotDir was given). */
  readonly screenshot?: Buffer;
}

/** The record keeps more ARIA text than the agent's copy; a multiple of the agent's cap bounds file size. */
const RECORD_ARIA_FACTOR = 8;

/** Observations of one call when the page's address moves under it (the second is the retry). */
const OBSERVE_ATTEMPTS = 2;

const withoutFragment = (url: string): string => {
  const hash = url.indexOf('#');
  return hash < 0 ? url : url.slice(0, hash);
};

// ─── Scope ─────────────────────────────────────────────────────────────────

export const parseScope = (scope: string | undefined): ObserveScope => {
  const value = (scope ?? '').trim();
  if (value.length === 0 || value === 'page') return { kind: 'page' };
  if (value.startsWith('block:')) {
    const name = value.slice('block:'.length).trim();
    if (name.length === 0) throw new ToolError('invalid-input', 'scope "block:" needs a data-block name, e.g. "block:SearchBlock"');
    return { kind: 'block', name };
  }
  const landmark = LandmarkRoleSchema.safeParse(value);
  if (landmark.success) return { kind: 'landmark', role: landmark.data };
  throw new ToolError(
    'invalid-input',
    `unknown scope "${value}": use "page", a landmark role (${LandmarkRoleSchema.options.join(', ')}), or "block:<data-block>"`,
  );
};

export const scopeLabel = (scope: ObserveScope): string =>
  scope.kind === 'page' ? 'page' : scope.kind === 'landmark' ? scope.role : `block:${scope.name}`;

const walkScope = (scope: ObserveScope): WalkScope | undefined =>
  scope.kind === 'page'
    ? undefined
    : scope.kind === 'landmark'
      ? { landmark: scope.role, ...(scope.name !== undefined ? { landmarkName: scope.name } : {}) }
      : { dataBlock: scope.name };

// ─── Candidates ────────────────────────────────────────────────────────────

const isLandmarkRole = (value: string | undefined): value is LandmarkRole =>
  value !== undefined && LandmarkRoleSchema.safeParse(value).success;

/**
 * A walker node as a contract Candidate: exactly the schema's fields,
 * free text PII-gated. strict mode also drops row text, the free text most
 * likely to carry customer data.
 */
export const toCandidate = (node: WalkNode, pii: PiiMode): Candidate => {
  const gate = (text: string): string => redact(text, pii);
  return {
    ref: node.ref,
    role: node.role,
    name: gate(node.name),
    namingSource: node.namingSource,
    affordance: node.affordance,
    interactive: node.interactive,
    tag: node.tag,
    ...(isLandmarkRole(node.landmark) ? { landmark: node.landmark } : {}),
    ...(node.landmarkName !== undefined ? { landmarkName: gate(node.landmarkName) } : {}),
    ...(node.dataBlock !== undefined ? { dataBlock: node.dataBlock } : {}),
    ...(node.rowText !== undefined && pii !== 'strict' ? { rowText: gate(node.rowText) } : {}),
    ...(node.testId !== undefined ? { testId: node.testId } : {}),
    ...(node.testIdAttribute !== undefined ? { testIdAttribute: node.testIdAttribute } : {}),
    ...(node.id !== undefined ? { id: node.id } : {}),
    ...(node.idKind !== undefined ? { idKind: node.idKind } : {}),
    ...(node.placeholder !== undefined ? { placeholder: gate(node.placeholder) } : {}),
    ...(node.inputType !== undefined ? { inputType: node.inputType } : {}),
    ...(node.level !== undefined ? { level: node.level } : {}),
    ...(node.checked !== undefined ? { checked: node.checked } : {}),
    visible: node.visible,
    enabled: node.enabled,
    inViewport: node.inViewport,
  };
};

/** Lower tiers are dropped first. Informational kinds: the least useful for authoring go first. */
const INFORMATIONAL_TIER: Readonly<Record<NodeCategory, number>> = {
  cell: 0,
  image: 1,
  row: 2,
  heading: 3,
  message: 4,
  dialog: 5,
  landmark: 6,
  control: 7,
};

/**
 * Drop priority (lowest first): non-interactive nodes (cells, images, rows,
 * headings, messages, dialogs, landmarks, in that order), then controls
 * that are not visible at all, then disabled controls, then controls
 * outside the viewport. Within a tier the later element goes first.
 * Survivors keep document order.
 */
export const dropTier = (candidate: Candidate, category: NodeCategory): number => {
  if (!candidate.interactive) return INFORMATIONAL_TIER[category];
  if (!candidate.visible) return 10;
  if (!candidate.enabled) return 11;
  if (!candidate.inViewport) return 12;
  return 13;
};

export const capCandidates = (
  candidates: readonly Candidate[],
  categories: Readonly<Record<string, NodeCategory>>,
  max: number,
): readonly Candidate[] => {
  if (candidates.length <= max) return candidates;
  const ranked = candidates
    .map((candidate, index) => ({ candidate, index, tier: dropTier(candidate, categories[candidate.ref] ?? 'control') }))
    .sort((a, b) => b.tier - a.tier || a.index - b.index);
  const keep = new Set(ranked.slice(0, Math.max(0, max)).map((entry) => entry.index));
  return candidates.filter((_candidate, index) => keep.has(index));
};

// ─── Audit ─────────────────────────────────────────────────────────────────

/**
 * Testability findings for developers. Duplicate names are grouped by
 * role, name, landmark and row: per-row "Edit" links are the normal case
 * and resolve by row scoping, so only duplicates nothing disambiguates are
 * reported.
 */
export const audit = (
  candidates: readonly Candidate[],
  options: { readonly landmarks?: readonly string[] } = {},
): readonly AuditFinding[] => {
  const controls = candidates.filter((c) => c.interactive);
  const unnamed = controls.filter((c) => c.name.length === 0);
  const groups = new Map<string, Candidate[]>();
  controls
    .filter((c) => c.name.length > 0)
    .forEach((c) => {
      const key = [c.role, c.name, c.landmark ?? '', c.landmarkName ?? '', c.rowText ?? ''].join('\u0000');
      groups.set(key, [...(groups.get(key) ?? []), c]);
    });
  const duplicates = [...groups.values()].filter((group) => group.length > 1);
  const structuralOnly = controls.filter((c) => c.idKind === 'structural' && c.testId === undefined && c.name.length === 0);
  const roleless = controls.filter((c) => c.role === 'generic');
  const placeholderOnly = controls.filter((c) => c.namingSource === 'placeholder');
  const landmarks = options.landmarks ?? [...new Set(candidates.filter((c) => !c.interactive && isLandmarkRole(c.role)).map((c) => c.role))];
  const refs = (list: readonly Candidate[]): string[] => list.map((c) => c.ref);
  return [
    ...(unnamed.length > 0
      ? [{ kind: 'unnamed-control' as const, refs: refs(unnamed), message: `${unnamed.length} control(s) have no accessible name; give them a label or aria-label.` }]
      : []),
    ...duplicates.map((group) => ({
      kind: 'duplicate-name' as const,
      refs: refs(group),
      message: `${group.length} ${group[0]?.role ?? ''} controls are all named "${group[0]?.name ?? ''}"${group[0]?.landmark !== undefined ? ` in the ${group[0].landmark} landmark` : ''}; only position tells them apart.`,
    })),
    ...(structuralOnly.length > 0
      ? [{ kind: 'structural-id-only' as const, refs: refs(structuralOnly), message: `${structuralOnly.length} control(s) are identifiable only by a compiled id that changes on republish; add a name or a test id.` }]
      : []),
    ...(roleless.length > 0
      ? [{ kind: 'roleless-clickable' as const, refs: refs(roleless), message: `${roleless.length} clickable element(s) have no role; use a Button or Link widget, or set role.` }]
      : []),
    ...(placeholderOnly.length > 0
      ? [{ kind: 'placeholder-only-input' as const, refs: refs(placeholderOnly), message: `${placeholderOnly.length} input(s) are named only by their placeholder, which disappears on typing; add a label.` }]
      : []),
    ...(!landmarks.includes('main')
      ? [{ kind: 'missing-landmarks' as const, refs: [], message: landmarks.length === 0 ? 'The page has no landmarks; scoping by region is unavailable.' : `The page has no main landmark (found: ${landmarks.join(', ')}).` }]
      : []),
  ];
};

// ─── Delta ─────────────────────────────────────────────────────────────────

const MAX_DELTA = 30;

const deltaKey = (c: Candidate): string =>
  [c.role, c.name, c.landmark ?? '', c.dataBlock ?? '', c.rowText ?? ''].join('\u0000');

/** Multiset difference by identity key: what is in `a` and not matched in `b`. */
const minus = (a: readonly Candidate[], b: readonly Candidate[]): readonly Candidate[] => {
  const counts = new Map<string, number>();
  b.forEach((c) => counts.set(deltaKey(c), (counts.get(deltaKey(c)) ?? 0) + 1));
  return a.filter((c) => {
    const key = deltaKey(c);
    const left = counts.get(key) ?? 0;
    if (left > 0) {
      counts.set(key, left - 1);
      return false;
    }
    return true;
  });
};

/** What an action changed: new and vanished candidates, URL and structure changes, alerts now showing. */
export const diffSnapshots = (
  before: SnapshotRecord,
  after: SnapshotRecord,
  alertsText: readonly string[] = after.alerts,
): SnapshotDelta => {
  const added = minus(after.candidates, before.candidates);
  const removed = minus(before.candidates, after.candidates);
  const salient = (c: Candidate, categories: Readonly<Record<string, NodeCategory>>): boolean =>
    c.interactive || ['message', 'dialog', 'heading'].includes(categories[c.ref] ?? 'control');
  const prioritized = [
    ...added.filter((c) => salient(c, after.categories)),
    ...added.filter((c) => !salient(c, after.categories)),
  ];
  return {
    snapshotId: after.snapshotId,
    url: after.url,
    urlChanged: before.url !== after.url,
    fingerprintChanged: before.fingerprint.hash !== after.fingerprint.hash,
    added: prioritized.slice(0, MAX_DELTA),
    removed: [...removed.filter((c) => salient(c, before.categories)), ...removed.filter((c) => !salient(c, before.categories))]
      .slice(0, MAX_DELTA)
      .map((c) => ({ role: c.role, name: c.name })),
    alerts: [...alertsText],
  };
};

// ─── Observe ───────────────────────────────────────────────────────────────

const describeScopeMiss = (scope: ObserveScope, signals: PageSignals): ToolError => {
  if (scope.kind === 'block') {
    const known = signals.fingerprint.dataBlockNames.slice(0, 20);
    return new ToolError('not-found', `no [data-block="${scope.name}"] container on the page${known.length > 0 ? `; blocks present: ${known.join(', ')}` : ''}`, {
      scope: scopeLabel(scope),
      dataBlocks: known,
    });
  }
  const landmarks = signals.fingerprint.landmarks;
  return new ToolError('not-found', `no "${scopeLabel(scope)}" landmark on the page; landmarks present: ${landmarks.length > 0 ? landmarks.join(', ') : 'none'}`, {
    scope: scopeLabel(scope),
    landmarks: [...landmarks],
  });
};

/**
 * Observe the page. Registers the snapshot's refs in the page (so the
 * locator ladder can verify them) and returns the agent-facing Snapshot
 * plus the full record to save. Throws ToolError('invalid-input') for a
 * malformed scope and ToolError('not-found') when the scope is absent.
 */
export const observePage = async (page: Page, options: ObserveOptions): Promise<ObserveResult> => {
  const pii = options.pii ?? DEFAULT_CONFIG.pii;
  const maxCandidates = options.maxCandidates ?? DEFAULT_CONFIG.observe.maxCandidates;
  const maxAriaBytes = options.maxAriaBytes ?? DEFAULT_CONFIG.observe.maxAriaBytes;
  const now = options.now ?? ((): Date => new Date());
  const scope = parseScope(options.scope);
  const snapshotId = options.snapshotId ?? newId('snap', now());
  const at = now().toISOString();

  const scan = async (): Promise<{ readonly walked: WalkResult; readonly signals: PageSignals }> => {
    const walked = await inPage(page, 'walk', { snapshotId, ...(walkScope(scope) !== undefined ? { scope: walkScope(scope) } : {}) });
    return { walked, signals: await inPage(page, 'signals') };
  };
  const scanSettled = async (): Promise<{ readonly walked: WalkResult; readonly signals: PageSignals }> => {
    try {
      return await scan().catch(async (error: unknown) => {
        // A click that navigates can destroy the document mid-walk; observe the new one once it has parsed.
        if (page.isClosed() || !/Execution context was destroyed|frame was detached|Cannot find context/i.test(String(error))) throw error;
        await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
        return scan();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error);
      throw new ToolError(/Timeout/i.test(message) ? 'timeout' : 'unclassified', `observing the page failed: ${message}`);
    }
  };

  /** The fragment does not count: a hash change does not change the document's screen. */
  const sameAddress = (urls: readonly string[]): boolean => new Set(urls.map(withoutFragment)).size === 1;

  /**
   * One observation: walk, signals, ARIA, then the address again. A client-side
   * route change (pushState: no document is destroyed) can land between any
   * two of them; the walk, the signals and the read after the ARIA capture
   * must all be of one address, else the record would hold one screen's
   * candidates under another's URL. Observed once more; then it is a timeout.
   */
  const observeOnce = async (): Promise<{ readonly walked: WalkResult; readonly signals: PageSignals; readonly aria: AriaCapture; readonly urls: readonly string[] }> => {
    const { walked, signals } = await scanSettled();
    if (!walked.scopeFound) {
      // A scope missing from a page that was moving is looked for again on the page it moved to.
      if (sameAddress([walked.url, signals.url])) throw describeScopeMiss(scope, signals);
      return { walked, signals, aria: { text: '', truncated: false, bytes: 0 }, urls: [walked.url, signals.url] };
    }
    const aria = await captureAria(page, scope, {
      maxBytes: maxAriaBytes * RECORD_ARIA_FACTOR,
      pii,
      ...(options.ariaTimeoutMs !== undefined ? { timeoutMs: options.ariaTimeoutMs } : {}),
    });
    const after = page.isClosed() ? '' : await page.evaluate('location.href').then(String, () => '');
    return { walked, signals, aria, urls: [walked.url, signals.url, after] };
  };
  let observed = await observeOnce();
  for (let attempt = 1; !sameAddress(observed.urls); attempt += 1) {
    if (attempt >= OBSERVE_ATTEMPTS) {
      const seen = [...new Set(observed.urls.filter((url) => url.length > 0).map((url) => redactUrl(url, pii)))];
      throw new ToolError('timeout', `the page kept navigating while it was observed (${seen.join(' → ')}); wait for it to settle (app.assert url) and observe again`, {
        urls: seen,
      });
    }
    observed = await observeOnce();
  }
  const { walked, signals, aria: ariaFull } = observed;
  if (!walked.scopeFound) throw describeScopeMiss(scope, signals);

  const all = walked.nodes.map((node) => toCandidate(node, pii));
  const categories: Record<string, NodeCategory> = Object.fromEntries(walked.nodes.map((node) => [node.ref, node.category]));
  const alerts = all.filter((c) => categories[c.ref] === 'message' && c.name.length > 0).map((c) => c.name);
  const capped = capCandidates(all, categories, maxCandidates);

  const ariaForAgent = capAriaText(ariaFull.text, maxAriaBytes);
  const agreement = nameAgreement(parseAriaSnapshot(ariaFull.text), all);

  // The address of the document the walk saw (the read-backs agreed with it).
  const pageUrl = walked.url;
  const fingerprint = buildFingerprint(signals.fingerprint, pageUrl, pii);
  const verdict = classifyVariant(signals.variant);
  const url = redactUrl(pageUrl, pii);
  const title = redact(signals.title, pii);

  let screenshot: Buffer | undefined;
  let screenshotPath: string | undefined;
  if (options.includeScreenshot === true) {
    screenshot = await page.screenshot({ type: 'png' }).catch(() => undefined);
    if (screenshot !== undefined && options.screenshotDir !== undefined) {
      screenshotPath = path.join(options.screenshotDir, `${snapshotId}.png`);
      await fs.mkdir(options.screenshotDir, { recursive: true });
      await fs.writeFile(screenshotPath, screenshot);
    }
  }

  const label = scopeLabel(scope);
  const snapshot: Snapshot = {
    snapshotId,
    pageId: options.pageId,
    at,
    url,
    title,
    variant: verdict.variant,
    scope: label,
    fingerprint,
    candidates: [...capped],
    totalCandidates: all.length,
    aria: ariaForAgent.text,
    // An ARIA capture that failed (ariaFull) is cut as surely as one over the cap.
    truncated: capped.length < all.length || ariaForAgent.truncated || ariaFull.truncated,
    ...(screenshotPath !== undefined ? { screenshotPath } : {}),
    ...(options.audit === true ? { audit: [...audit(all, { landmarks: fingerprint.landmarks })] } : {}),
  };
  const record: SnapshotRecord = {
    version: SNAPSHOT_RECORD_VERSION,
    snapshotId,
    pageId: options.pageId,
    at,
    url,
    title,
    variant: verdict.variant,
    variantEvidence: verdict.evidence,
    variantSignals: signals.variant,
    scope: label,
    fingerprint,
    fingerprintBasis: fingerprintBasis(signals.fingerprint),
    candidates: all,
    categories,
    alerts,
    aria: ariaFull.text,
    ariaTruncated: ariaFull.truncated,
    nameAgreement: agreement,
    stats: walked.stats,
    pii,
    ...(screenshotPath !== undefined ? { screenshotPath } : {}),
  };
  return { snapshot, record, address: pageUrl, ...(screenshot !== undefined ? { screenshot } : {}) };
};

/** The OutSystems variant of the current page (for app.open), without a full observation. */
export const pageVariant = async (page: Page): Promise<VariantVerdict> => classifyVariant((await inPage(page, 'signals')).variant);

/** The agent-facing Snapshot for a stored record (e.g. to re-serve a snapshot by id), capped the same way. */
export const snapshotFromRecord = (
  record: SnapshotRecord,
  options: { readonly maxCandidates?: number; readonly maxAriaBytes?: number; readonly audit?: boolean } = {},
): Snapshot => {
  const maxCandidates = options.maxCandidates ?? DEFAULT_CONFIG.observe.maxCandidates;
  const aria = capAriaText(record.aria, options.maxAriaBytes ?? DEFAULT_CONFIG.observe.maxAriaBytes);
  const capped = capCandidates(record.candidates, record.categories, maxCandidates);
  return {
    snapshotId: record.snapshotId,
    pageId: record.pageId,
    at: record.at,
    url: record.url,
    title: record.title,
    variant: record.variant,
    scope: record.scope,
    fingerprint: record.fingerprint,
    candidates: [...capped],
    totalCandidates: record.candidates.length,
    aria: aria.text,
    truncated: capped.length < record.candidates.length || aria.truncated || record.ariaTruncated,
    ...(record.screenshotPath !== undefined ? { screenshotPath: record.screenshotPath } : {}),
    ...(options.audit === true ? { audit: [...audit(record.candidates, { landmarks: record.fingerprint.landmarks })] } : {}),
  };
};
