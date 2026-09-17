#!/usr/bin/env tsx
/**
 * Print the reality-study measurements (F1–F6) for one or more
 * SnapshotRecord files, so the study's numbers are reproducible and
 * a held-out route can be scored on the same yardstick.
 *
 *   npx tsx scripts/substrate-reality-stats.ts <record.json> [more.json…]
 *   npx tsx scripts/substrate-reality-stats.ts --dir workshop/substrate-study/logs/snapshots
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SnapshotRecord } from '../workshop/substrate-study/domain/snapshot-record';
import { computeRealityStats, renderRealityStats } from '../workshop/substrate-study/application/reality-stats';

function collect(argv: readonly string[]): readonly string[] {
  const dirIdx = argv.indexOf('--dir');
  if (dirIdx >= 0) {
    const dir = argv[dirIdx + 1];
    if (!dir) throw new Error('--dir requires a path');
    const walk = (d: string): readonly string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.json') ? [path.join(d, e.name)] : [],
      );
    return walk(dir).sort();
  }
  return argv.filter((a) => a.endsWith('.json'));
}

const files = collect(process.argv.slice(2));
if (files.length === 0) {
  process.stderr.write('usage: substrate-reality-stats <record.json>… | --dir <snapshots-dir>\n');
  process.exit(2);
}
for (const file of files) {
  const record = JSON.parse(fs.readFileSync(file, 'utf8')) as SnapshotRecord;
  process.stdout.write(`${renderRealityStats(computeRealityStats(record))}\n\n`);
}
