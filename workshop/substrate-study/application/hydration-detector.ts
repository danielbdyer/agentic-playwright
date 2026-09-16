/**
 * Hydration detector — the four-phase compound heuristic plus the
 * validation re-snapshot from
 * `docs/v2-substrate-ladder-plan.d0a-harness-design.md §2`.
 *
 *   Phase A — navigation completion (goto + readyState + networkidle),
 *             bounded by `navigationTimeoutMs`.
 *   Phase B — DOM-mutation quiescence: an injected MutationObserver
 *             is polled every `mutationPollIntervalMs`; success is
 *             `mutationQuietPolls` consecutive zero-delta polls;
 *             bounded by `hydrationTimeoutMs`.
 *   Phase C — structural-signature stability: two walks separated
 *             by `signatureSettleDelayMs` must agree; disagreement
 *             re-enters Phase B up to `phaseBRetryCap` times.
 *   Phase D — framework-readiness signal (best-effort, additive).
 *             Recorded, never gating; promoted once a real signal is
 *             observed in the corpus (§2.4).
 *   Phase E — validation re-snapshot: two full walks 500ms apart
 *             must agree; the first is retained.
 *
 * Verdict precedence is worst-wins (§2.6) and is realized by early
 * return in phase order. The detector never throws: every path
 * yields exactly one `HydrationVerdict` (L-Harness-Verdict-Total).
 *
 * Playwright is promise-based, so this module is async at the
 * boundary; the harness lifts it into Effect. No Effect imports here.
 */

import type { Page } from '@playwright/test';
import type { HydrationPhaseTimings, HydrationVerdict } from '../domain/hydration-verdict';
import { computeStructuralSignature } from '../domain/snapshot-record';
import { walkDom, type DomWalkOutput } from './dom-walk-capture';

export interface HydrationDetectorOptions {
  /** Phase A ceiling. Default 15_000. */
  readonly navigationTimeoutMs?: number;
  /** Phase B ceiling after Phase A. Default 20_000. */
  readonly hydrationTimeoutMs?: number;
  /** Consecutive zero-mutation polls required. Default 3. */
  readonly mutationQuietPolls?: number;
  /** Poll interval. Default 200. */
  readonly mutationPollIntervalMs?: number;
  /** Warm-up after Phase A before polling begins. Default 500. */
  readonly warmUpMs?: number;
  /** Delay between the two Phase C signatures. Default 400. */
  readonly signatureSettleDelayMs?: number;
  /** Phase C → Phase B re-entry cap. Default 3. */
  readonly phaseBRetryCap?: number;
  /** Delay between the two Phase E walks. Default 500. */
  readonly validationDelayMs?: number;
}

export const DEFAULT_HYDRATION_OPTIONS: Required<HydrationDetectorOptions> = {
  navigationTimeoutMs: 15_000,
  hydrationTimeoutMs: 20_000,
  mutationQuietPolls: 3,
  mutationPollIntervalMs: 200,
  warmUpMs: 500,
  signatureSettleDelayMs: 400,
  phaseBRetryCap: 3,
  validationDelayMs: 500,
};

/** What Phase D observed. Informational until a real ready signal
 *  is promoted to authoritative. */
export interface FrameworkReadiness {
  readonly runtimeGlobalPresent: boolean;
  readonly blocksMounted: number;
  readonly explicitReadySignal: string | null;
}

export interface HydrationOutcome {
  readonly verdict: HydrationVerdict;
  /** The retained (first) Phase E walk, or the partial walk taken
   *  at a Phase B/C ceiling, or null when nothing was captured. */
  readonly walk: DomWalkOutput | null;
  readonly readiness: FrameworkReadiness | null;
  readonly httpStatus: number | null;
}

const MUTATION_COUNTER_KEY = '__tesseractMutationCount';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timings(partial: Partial<HydrationPhaseTimings>): HydrationPhaseTimings {
  return {
    phaseAms: partial.phaseAms ?? 0,
    phaseBms: partial.phaseBms ?? 0,
    phaseCms: partial.phaseCms ?? 0,
    phaseDms: partial.phaseDms ?? 0,
    phaseEms: partial.phaseEms ?? 0,
  };
}

function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? '';
  const message = (err as { message?: string } | null)?.message ?? '';
  return name === 'TimeoutError' || /Timeout \d+ms exceeded/i.test(message);
}

async function injectMutationObserver(page: Page): Promise<boolean> {
  try {
    return await page.evaluate((key) => {
      const w = window as unknown as Record<string, unknown>;
      if (typeof w[key] === 'number') return true;
      if (typeof MutationObserver === 'undefined') return false;
      w[key] = 0;
      const observer = new MutationObserver((records) => {
        w[key] = (w[key] as number) + records.length;
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      return true;
    }, MUTATION_COUNTER_KEY);
  } catch {
    return false;
  }
}

async function readMutationCount(page: Page): Promise<number> {
  try {
    return await page.evaluate((key) => {
      const v = (window as unknown as Record<string, unknown>)[key];
      return typeof v === 'number' ? v : 0;
    }, MUTATION_COUNTER_KEY);
  } catch {
    return 0;
  }
}

/** Phase B: poll until `quietPolls` consecutive polls show no new
 *  mutations, or the ceiling passes. Returns whether quiescence was
 *  reached and the final mutation count. */
async function awaitQuiescence(
  page: Page,
  opts: Required<HydrationDetectorOptions>,
  ceilingMs: number,
): Promise<{ readonly quiet: boolean; readonly mutations: number }> {
  const deadline = Date.now() + ceilingMs;
  let last = await readMutationCount(page);
  let quietRun = 0;
  while (Date.now() < deadline) {
    await sleep(opts.mutationPollIntervalMs);
    const now = await readMutationCount(page);
    if (now === last) {
      quietRun += 1;
      if (quietRun >= opts.mutationQuietPolls) return { quiet: true, mutations: now };
    } else {
      quietRun = 0;
      last = now;
    }
  }
  return { quiet: false, mutations: last };
}

async function safeWalk(page: Page): Promise<DomWalkOutput | null> {
  try {
    return await walkDom(page);
  } catch {
    return null;
  }
}

/** Phase D: best-effort readiness probe. Records what the runtime
 *  exposes; never gates. */
async function probeReadiness(page: Page): Promise<FrameworkReadiness | null> {
  try {
    return await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const os = w['OutSystems'] as Record<string, unknown> | undefined;
      const candidates: ReadonlyArray<readonly [string, unknown]> = [
        ['body[data-os-ready]', document.body.getAttribute('data-os-ready')],
        ['window.OutSystems.Internal.ready', (os?.['Internal'] as Record<string, unknown> | undefined)?.['ready']],
        ['window.OutSystemsReactive.state', (w['OutSystemsReactive'] as Record<string, unknown> | undefined)?.['state']],
      ];
      const hit = candidates.find(([, v]) => v === true || v === 'true' || v === 'ready');
      return {
        runtimeGlobalPresent: os !== undefined || w['OSFramework'] !== undefined,
        blocksMounted: document.querySelectorAll('[data-block]').length,
        explicitReadySignal: hit ? hit[0] : null,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Run Phases A–E against `url` on an already-created page. Returns
 * one verdict plus whatever walk was retained. Never throws.
 */
export async function detectHydrationAndCapture(
  page: Page,
  url: string,
  options: HydrationDetectorOptions = {},
): Promise<HydrationOutcome> {
  const opts: Required<HydrationDetectorOptions> = { ...DEFAULT_HYDRATION_OPTIONS, ...definedOnly(options) };
  const t = { a: 0, b: 0, c: 0, d: 0, e: 0 };
  let mutationCount = 0;
  let phaseBRetries = 0;
  let httpStatus: number | null = null;

  // ── Phase A ────────────────────────────────────────────────
  const aStart = Date.now();
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: opts.navigationTimeoutMs });
    httpStatus = response?.status() ?? null;
    const remaining = Math.max(250, opts.navigationTimeoutMs - (Date.now() - aStart));
    await page.waitForLoadState('networkidle', { timeout: remaining });
    const ready = await page.evaluate(() => document.readyState);
    if (ready !== 'complete') {
      await page.waitForFunction(() => document.readyState === 'complete', undefined, {
        timeout: Math.max(250, opts.navigationTimeoutMs - (Date.now() - aStart)),
      });
    }
  } catch (err) {
    t.a = Date.now() - aStart;
    const kind = isTimeoutError(err) ? 'load-timeout' : 'navigation-error';
    return {
      verdict: {
        kind,
        diagnostic:
          kind === 'load-timeout'
            ? `Phase A: navigation did not reach load + networkidle + readyState=complete within ${opts.navigationTimeoutMs}ms (${(err as Error).message.split('\n')[0]})`
            : `Phase A: navigation failed: ${(err as Error).message.split('\n')[0]}`,
        phaseTimings: timings({ phaseAms: t.a }),
        phaseBRetries: 0,
        mutationCount: 0,
      },
      walk: null,
      readiness: null,
      httpStatus,
    };
  }
  t.a = Date.now() - aStart;

  // ── Phase B (with Phase C re-entry) ────────────────────────
  const bStart = Date.now();
  const observed = await injectMutationObserver(page);
  if (!observed) {
    t.b = Date.now() - bStart;
    return {
      verdict: {
        kind: 'observer-unavailable',
        diagnostic: 'Phase B: MutationObserver could not be installed (CSP or evaluation failure)',
        phaseTimings: timings({ phaseAms: t.a, phaseBms: t.b }),
        phaseBRetries: 0,
        mutationCount: 0,
      },
      walk: null,
      readiness: await probeReadiness(page),
      httpStatus,
    };
  }
  await sleep(opts.warmUpMs);

  let stableSignature = false;
  let cStart = 0;
  for (;;) {
    const ceiling = opts.hydrationTimeoutMs - (Date.now() - bStart);
    if (ceiling <= 0) break;
    const q = await awaitQuiescence(page, opts, ceiling);
    mutationCount = q.mutations;
    if (!q.quiet) break;
    t.b = Date.now() - bStart;

    // ── Phase C ──────────────────────────────────────────────
    cStart = Date.now();
    const w1 = await safeWalk(page);
    await sleep(opts.signatureSettleDelayMs);
    const w2 = await safeWalk(page);
    t.c += Date.now() - cStart;
    if (w1 && w2 && computeStructuralSignature(w1.nodes) === computeStructuralSignature(w2.nodes)) {
      stableSignature = true;
      break;
    }
    phaseBRetries += 1;
    if (phaseBRetries > opts.phaseBRetryCap) break;
  }
  if (t.b === 0) t.b = Date.now() - bStart;

  if (!stableSignature) {
    const partial = await safeWalk(page);
    const readiness = await probeReadiness(page);
    const storm = phaseBRetries === 0 || Date.now() - bStart >= opts.hydrationTimeoutMs;
    return {
      verdict: storm
        ? {
            kind: 'mutation-storm',
            diagnostic: `Phase B: DOM mutated ${mutationCount} times without ${opts.mutationQuietPolls} consecutive quiet polls inside ${opts.hydrationTimeoutMs}ms. Likely an animation loop, polling endpoint, or real-time component; partial walk retained (${partial?.nodes.length ?? 0} nodes).`,
            phaseTimings: timings({ phaseAms: t.a, phaseBms: t.b, phaseCms: t.c }),
            phaseBRetries,
            mutationCount,
          }
        : {
            kind: 'signature-unstable',
            diagnostic: `Phase C: structural signature kept drifting after ${phaseBRetries} Phase B re-entries (cap ${opts.phaseBRetryCap}); partial walk retained (${partial?.nodes.length ?? 0} nodes).`,
            phaseTimings: timings({ phaseAms: t.a, phaseBms: t.b, phaseCms: t.c }),
            phaseBRetries,
            mutationCount,
          },
      walk: partial,
      readiness,
      httpStatus,
    };
  }

  // ── Phase D ────────────────────────────────────────────────
  const dStart = Date.now();
  const readiness = await probeReadiness(page);
  t.d = Date.now() - dStart;

  // ── Phase E ────────────────────────────────────────────────
  const eStart = Date.now();
  const first = await safeWalk(page);
  await sleep(opts.validationDelayMs);
  const second = await safeWalk(page);
  t.e = Date.now() - eStart;
  mutationCount = await readMutationCount(page);

  if (!first || !second) {
    return {
      verdict: {
        kind: 'capture-unstable',
        diagnostic: 'Phase E: the DOM walk itself failed on at least one of the two validation captures.',
        phaseTimings: timings({ phaseAms: t.a, phaseBms: t.b, phaseCms: t.c, phaseDms: t.d, phaseEms: t.e }),
        phaseBRetries,
        mutationCount,
      },
      walk: first ?? second,
      readiness,
      httpStatus,
    };
  }
  const s1 = computeStructuralSignature(first.nodes);
  const s2 = computeStructuralSignature(second.nodes);
  if (s1 !== s2) {
    return {
      verdict: {
        kind: 'capture-unstable',
        diagnostic: `Phase E: validation re-snapshot diverged (${first.nodes.length} vs ${second.nodes.length} nodes; signatures differ) ${opts.validationDelayMs}ms apart.`,
        phaseTimings: timings({ phaseAms: t.a, phaseBms: t.b, phaseCms: t.c, phaseDms: t.d, phaseEms: t.e }),
        phaseBRetries,
        mutationCount,
      },
      walk: first,
      readiness,
      httpStatus,
    };
  }

  const readinessNote = readiness
    ? readiness.explicitReadySignal
      ? `Phase D: explicit ready signal ${readiness.explicitReadySignal}`
      : `Phase D: no explicit ready signal; runtime global ${readiness.runtimeGlobalPresent ? 'present' : 'absent'}, ${readiness.blocksMounted} data-block nodes mounted`
    : 'Phase D: readiness probe unavailable';
  return {
    verdict: {
      kind: 'stable',
      diagnostic: `Phases A–E passed: ${first.nodes.length} nodes; ${mutationCount} mutations observed; ${phaseBRetries} Phase B re-entries. ${readinessNote}.`,
      phaseTimings: timings({ phaseAms: t.a, phaseBms: t.b, phaseCms: t.c, phaseDms: t.d, phaseEms: t.e }),
      phaseBRetries,
      mutationCount,
    },
    walk: first,
    readiness,
    httpStatus,
  };
}

function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}
