/**
 * External-snapshot harness — composes the rung-4 capture pipeline
 * from `docs/v2-substrate-ladder-plan.d0a-harness-design.md §§1–6`
 * against a real Reactive host:
 *
 *   partition guard (C2) → robots.txt (§6.3) → navigate + hydrate
 *   (§2) → DOM walk (§3) → variant classification (§4.4) → PII gate
 *   (§6.4) → SnapshotRecord (§4).
 *
 * Two refusals are hard failures rather than verdicts, because they
 * must not even produce a record: a route the study partition does
 * not list as `study` (HeldOutRouteContactAttempt), and a URL under
 * no declared partition at all. Everything after the guard yields a
 * record whose `hydration.kind` carries the outcome; the harness
 * never throws past that point (L-Harness-Verdict-Total).
 *
 * The record's `substrateVersion` is the host's own Reactive
 * `versionToken` when the module manifest is reachable, so that
 * snapshots key by what the platform itself calls a version; it
 * falls back to the workshop substrate version otherwise.
 *
 * Async at the Playwright boundary; the CLI lifts into Effect.
 */

import type { Browser, Page } from '@playwright/test';
import { snapshotRecord, type SnapshotNode, type SnapshotRecord } from '../domain/snapshot-record';
import type { HydrationVerdict } from '../domain/hydration-verdict';
import { classifyVariant } from './variant-classifier';
import { detectHydrationAndCapture, type FrameworkReadiness, type HydrationDetectorOptions } from './hydration-detector';
import { assertHarvestAllowed, type StudyPartitionManifest } from './study-partition';
import { SUBSTRATE_VERSION } from '../../substrate/version';

/** Disclosed User-Agent per design §6.1. */
export const HARVEST_USER_AGENT =
  'Mozilla/5.0 (compatible; tesseract-substrate-study/0.1; +https://github.com/danielbdyer/agentic-playwright)';

export interface ExternalSnapshotRequest {
  readonly url: string;
  /** The declared partition the URL must belong to (C1/C2). */
  readonly partition: StudyPartitionManifest;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly userAgent?: string;
  readonly hydration?: HydrationDetectorOptions;
  /** Skip the robots.txt check. Strongly discouraged (§6.3). */
  readonly ignoreRobots?: boolean;
  /** Fulfil every subresource request (scripts, styles, XHR, fetch)
   *  through Playwright's request context instead of Chromium's own
   *  network stack. Some egress proxies (the remote-session agent
   *  proxy, 2026-09-16) let the HTML document through but fail every
   *  larger subresource with `net::ERR_TOO_MANY_RETRIES`, so the
   *  Reactive runtime never mounts and the harvest captures the
   *  pre-hydration shell. The request context uses a separate HTTP
   *  stack that the same proxy serves correctly. Method, headers and
   *  body are preserved (`request.fetch(Request)`); the DOM the page
   *  builds is the same, only the transport differs. Off by default. */
  readonly relaySubresources?: boolean;
  readonly now?: () => Date;
}

export interface ExternalSnapshotResult {
  readonly record: SnapshotRecord;
  readonly readiness: FrameworkReadiness | null;
  readonly httpStatus: number | null;
  readonly robots: RobotsVerdict;
  /** Fields redacted by the PII gate, as `path.field` strings. */
  readonly redactions: readonly string[];
  /** The host's module manifest version token, when reachable. */
  readonly hostVersionToken: string | null;
}

export type RobotsVerdict =
  | { readonly kind: 'allowed'; readonly source: 'no-robots-file' | 'no-matching-rule' | 'explicit-allow' }
  | { readonly kind: 'disallowed'; readonly rule: string }
  | { readonly kind: 'skipped' };

// ─── robots.txt (minimal, pure parser) ───────────────────────

/** Evaluate a robots.txt body for `userAgentToken` against `pathname`.
 *  Groups are matched by exact token (case-insensitive) first, then
 *  `*`. Longest matching rule wins; Allow beats Disallow at equal
 *  length (Google semantics). Pure. */
export function evaluateRobots(body: string, userAgentToken: string, pathname: string): RobotsVerdict {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line.length === 0) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value.length === 0) continue; // empty Disallow = allow all
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const token = userAgentToken.toLowerCase();
  const applicable =
    groups.find((g) => g.agents.some((a) => a === token)) ??
    groups.find((g) => g.agents.some((a) => a === '*'));
  if (!applicable) return { kind: 'allowed', source: 'no-matching-rule' };
  const matches = applicable.rules
    .filter((r) => matchesRobotsPath(r.path, pathname))
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  const winner = matches[0];
  if (!winner) return { kind: 'allowed', source: 'no-matching-rule' };
  return winner.allow
    ? { kind: 'allowed', source: 'explicit-allow' }
    : { kind: 'disallowed', rule: `Disallow: ${winner.path}` };
}

function matchesRobotsPath(rule: string, pathname: string): boolean {
  const escaped = rule
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const anchored = escaped.endsWith('\\$') ? `^${escaped.slice(0, -2)}$` : `^${escaped}`;
  return new RegExp(anchored).test(pathname);
}

// ─── PII gate (§6.4) ─────────────────────────────────────────

const PII_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.-]{2,}/],
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/],
  ['credit-card', /\b(?:\d[ -]?){13,16}\b/],
  ['phone', /(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]\d{3}[\s-]\d{4}\b/],
];

export function containsPii(text: string): string | null {
  for (const [label, re] of PII_PATTERNS) {
    if (re.test(text)) return label;
  }
  return null;
}

/** Redact PII from label text and data-attribute values. Returns the
 *  redacted nodes and the list of redacted field paths. Pure. */
export function redactPii(nodes: readonly SnapshotNode[]): {
  readonly nodes: readonly SnapshotNode[];
  readonly redactions: readonly string[];
} {
  const redactions: string[] = [];
  const scrub = (value: string | null, field: string, nodePath: string): string | null => {
    if (value !== null && containsPii(value) !== null) {
      redactions.push(`${nodePath}.${field}`);
      return '<redacted>';
    }
    return value;
  };
  const out = nodes.map((n) => {
    const labelText = scrub(n.labelText, 'labelText', n.path);
    const label = scrub(n.ariaNaming.label, 'ariaNaming.label', n.path);
    const accessibleName = scrub(n.ariaNaming.accessibleName, 'ariaNaming.accessibleName', n.path);
    const placeholder = scrub(n.interaction.placeholder, 'interaction.placeholder', n.path);
    let dataAttrValues = n.dataAttrValues;
    const hits = Object.entries(dataAttrValues).filter(([, v]) => containsPii(v) !== null);
    if (hits.length > 0) {
      dataAttrValues = Object.fromEntries(
        Object.entries(dataAttrValues).map(([k, v]) => (containsPii(v) !== null ? [k, '<redacted>'] : [k, v])),
      );
      for (const [k] of hits) redactions.push(`${n.path}.dataAttrValues.${k}`);
    }
    const untouched =
      labelText === n.labelText &&
      label === n.ariaNaming.label &&
      accessibleName === n.ariaNaming.accessibleName &&
      placeholder === n.interaction.placeholder &&
      dataAttrValues === n.dataAttrValues;
    return untouched
      ? n
      : {
          ...n,
          labelText,
          dataAttrValues,
          ariaNaming: { ...n.ariaNaming, label, accessibleName },
          interaction: { ...n.interaction, placeholder },
        };
  });
  return { nodes: out, redactions };
}

// ─── Host version token (Reactive module manifest) ───────────

/** Reactive apps serve `<module>/moduleservices/moduleinfo` with a
 *  `manifest.versionToken`. Best-effort; null when unreachable. */
export async function fetchHostVersionToken(page: Page, partition: StudyPartitionManifest): Promise<string | null> {
  try {
    const endpoint = `${partition.baseUrl.replace(/\/+$/, '')}/${partition.moduleInfoEndpoint}`;
    const response = await page.request.get(endpoint, { timeout: 10_000 });
    if (!response.ok()) return null;
    const json = (await response.json()) as { manifest?: { versionToken?: string } };
    return json.manifest?.versionToken ?? null;
  } catch {
    return null;
  }
}

// ─── Capture ─────────────────────────────────────────────────

async function checkRobots(page: Page, url: string, userAgentToken: string): Promise<RobotsVerdict> {
  const target = new URL(url);
  try {
    const response = await page.request.get(`${target.origin}/robots.txt`, { timeout: 10_000 });
    if (response.status() === 404) return { kind: 'allowed', source: 'no-robots-file' };
    if (!response.ok()) return { kind: 'allowed', source: 'no-robots-file' };
    return evaluateRobots(await response.text(), userAgentToken, target.pathname);
  } catch {
    return { kind: 'allowed', source: 'no-robots-file' };
  }
}

/**
 * Capture one URL. Throws only for the two hard refusals named in
 * the module header; every other outcome is a record.
 */
export async function captureExternalSnapshot(
  browser: Browser,
  request: ExternalSnapshotRequest,
): Promise<ExternalSnapshotResult> {
  // C2 at the harvest seam: refuse before any contact.
  assertHarvestAllowed(request.partition, request.url);

  const now = request.now ?? (() => new Date());
  const viewport = request.viewport ?? { width: 1280, height: 800 };
  const userAgent = request.userAgent ?? HARVEST_USER_AGENT;
  const context = await browser.newContext({ viewport, userAgent, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  if (request.relaySubresources === true) {
    await page.route('**/*', async (route) => {
      const req = route.request();
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        await route.continue();
        return;
      }
      try {
        const relayed = await context.request.fetch(req, { timeout: 60_000, maxRedirects: 5 });
        await route.fulfill({ response: relayed });
      } catch {
        await route.abort();
      }
    });
  }
  const started = now();
  try {
    const robots: RobotsVerdict = request.ignoreRobots
      ? { kind: 'skipped' }
      : await checkRobots(page, request.url, 'tesseract-substrate-study');

    const hostVersionToken = await fetchHostVersionToken(page, request.partition);
    const substrateVersion = hostVersionToken ?? SUBSTRATE_VERSION;

    if (robots.kind === 'disallowed') {
      const verdict: HydrationVerdict = {
        kind: 'robots-disallowed',
        diagnostic: `robots.txt forbids this user agent for ${new URL(request.url).pathname} (${robots.rule}); page not fetched.`,
        phaseTimings: { phaseAms: 0, phaseBms: 0, phaseCms: 0, phaseDms: 0, phaseEms: 0 },
        phaseBRetries: 0,
        mutationCount: 0,
      };
      return {
        record: snapshotRecord({
          url: request.url,
          fetchedAt: started.toISOString(),
          substrateVersion,
          userAgent,
          viewport,
          hydration: verdict,
          captureLatencyMs: now().getTime() - started.getTime(),
          nodes: [],
          framework: emptyFramework(),
          variantClassifier: { kind: 'not-reactive', evidence: ['page not fetched: robots-disallowed'] },
        }),
        readiness: null,
        httpStatus: null,
        robots,
        redactions: [],
        hostVersionToken,
      };
    }

    const outcome = await detectHydrationAndCapture(page, request.url, request.hydration ?? {});
    const walk = outcome.walk;
    const { nodes, redactions } = walk ? redactPii(walk.nodes) : { nodes: [], redactions: [] };
    const variantClassifier = walk
      ? classifyVariant(walk.variantSignals)
      : { kind: 'not-reactive' as const, evidence: ['no DOM walk retained'] };
    const hydration: HydrationVerdict =
      redactions.length > 0
        ? {
            ...outcome.verdict,
            kind: 'sensitive-content-detected',
            diagnostic: `${outcome.verdict.diagnostic} PII gate: ${redactions.length} field(s) redacted (${redactions.slice(0, 3).join(', ')}${redactions.length > 3 ? ', …' : ''}).`,
          }
        : outcome.verdict;

    const record = snapshotRecord({
      url: request.url,
      fetchedAt: started.toISOString(),
      substrateVersion,
      userAgent,
      viewport,
      hydration,
      captureLatencyMs: now().getTime() - started.getTime(),
      nodes,
      framework: walk ? walk.frameworkCounts : emptyFramework(),
      variantClassifier,
    });
    return {
      record,
      readiness: outcome.readiness,
      httpStatus: outcome.httpStatus,
      robots,
      redactions,
      hostVersionToken,
    };
  } finally {
    await context.close();
  }
}

function emptyFramework(): SnapshotRecord['payload']['framework'] {
  return {
    reactDetected: false,
    angularDetected: false,
    vueDetected: false,
    webComponentCount: 0,
    shadowRootCount: 0,
    iframeCount: 0,
  };
}
