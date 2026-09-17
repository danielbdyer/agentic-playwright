#!/usr/bin/env tsx
/**
 * Harvest one external Reactive page into a SnapshotRecord.
 *
 * Per `docs/v2-substrate-ladder-plan.d0a-harness-design.md §7`.
 * One URL per invocation; no crawling; disclosed User-Agent; the
 * study partition is consulted before any contact (C2), so a
 * held-out route is refused with exit 30 and no record.
 *
 *   npx tsx scripts/harvest-external-snapshot.ts \
 *     --url https://outsystemsui.outsystems.com/OutSystemsUIWebsite/Employeesdirectory \
 *     --aut outsystems-ui-website \
 *     [--viewport 1280x800] [--timeout-navigation 15000] \
 *     [--timeout-hydration 20000] [--ignore-robots] [--out <path>] [--retry 0]
 *     [--relay-subresources]   # egress proxies that fail Chromium subresource fetches
 *
 * Exit codes (§7.3): 0 stable · 10 stable-but-framework-confirmed-only ·
 * 20 record persisted with a failure verdict · 30 hard failure (no record).
 *
 * The browser executable honors TESSERACT_PLAYWRIGHT_EXECUTABLE, the
 * same convention the public-AUT cohort runner uses.
 */

import { Effect } from 'effect';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from '@playwright/test';
import { captureExternalSnapshot } from '../workshop/substrate-study/application/external-snapshot-harness';
import { loadStudyPartition, HeldOutRouteContactAttempt } from '../workshop/substrate-study/application/study-partition';
import { createLocalSnapshotStore, sampleIdOfRecord } from '../workshop/substrate-study/infrastructure/snapshot-store';
import { isCaptureSuccessful } from '../workshop/substrate-study/domain/hydration-verdict';

interface Args {
  readonly url: string;
  readonly aut: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly navigationTimeoutMs: number;
  readonly hydrationTimeoutMs: number;
  readonly ignoreRobots: boolean;
  readonly relaySubresources: boolean;
  readonly out: string | null;
  readonly retry: number;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
  };
  const url = get('--url');
  const aut = get('--aut');
  if (!url || !aut) {
    throw new Error('usage: harvest-external-snapshot --url <url> --aut <partition-name> [--viewport WxH] [--timeout-navigation ms] [--timeout-hydration ms] [--ignore-robots] [--relay-subresources] [--out path] [--retry n]');
  }
  const vp = (get('--viewport') ?? '1280x800').split('x').map((n) => Number.parseInt(n, 10));
  return {
    url,
    aut,
    viewport: { width: vp[0] ?? 1280, height: vp[1] ?? 800 },
    navigationTimeoutMs: Number.parseInt(get('--timeout-navigation') ?? '15000', 10),
    hydrationTimeoutMs: Number.parseInt(get('--timeout-hydration') ?? '20000', 10),
    ignoreRobots: argv.includes('--ignore-robots'),
    relaySubresources: argv.includes('--relay-subresources'),
    out: get('--out'),
    retry: Number.parseInt(get('--retry') ?? '0', 10),
  };
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const rootDir = process.cwd();
  const partition = loadStudyPartition(rootDir, args.aut);
  const executablePath = process.env.TESSERACT_PLAYWRIGHT_EXECUTABLE;

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    let attempt = 0;
    for (;;) {
      const result = await captureExternalSnapshot(browser, {
        url: args.url,
        partition,
        viewport: args.viewport,
        ignoreRobots: args.ignoreRobots,
        relaySubresources: args.relaySubresources,
        hydration: {
          navigationTimeoutMs: args.navigationTimeoutMs,
          hydrationTimeoutMs: args.hydrationTimeoutMs,
        },
      });
      const { record } = result;
      const verdict = record.payload.hydration;

      let persistedPath: string;
      if (args.out) {
        fs.mkdirSync(path.dirname(args.out), { recursive: true });
        fs.writeFileSync(args.out, JSON.stringify(record, null, 2), 'utf-8');
        persistedPath = args.out;
      } else {
        const store = createLocalSnapshotStore({ rootDir: path.join(rootDir, 'workshop', 'substrate-study', 'logs', 'snapshots') });
        persistedPath = await Effect.runPromise(store.write(record));
      }

      const mark = isCaptureSuccessful(verdict) ? '✓' : '✗';
      const partial = verdict.kind === 'mutation-storm' || verdict.kind === 'signature-unstable' ? '~' : '';
      process.stdout.write(
        `${mark} ${verdict.kind} | url=${args.url} nodes=${partial}${record.payload.nodeCount} sig=${record.payload.structuralSignature.slice(0, 12)} variant=${record.payload.variantClassifier.kind} host-version=${result.hostVersionToken ?? 'n/a'} http=${result.httpStatus ?? 'n/a'} robots=${result.robots.kind} redactions=${result.redactions.length} ${record.payload.captureLatencyMs}ms\n` +
          `  sample=${sampleIdOfRecord(record)} → ${persistedPath}\n` +
          `  ${verdict.diagnostic}\n`,
      );

      if (isCaptureSuccessful(verdict)) return verdict.kind === 'stable' ? 0 : 10;
      if (attempt >= args.retry) return 20;
      attempt += 1;
      process.stderr.write(`retrying (${attempt}/${args.retry})…\n`);
    }
  } finally {
    await browser.close();
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const refused = err instanceof HeldOutRouteContactAttempt;
    process.stderr.write(`${refused ? 'refused' : 'hard failure'}: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 30;
  });
