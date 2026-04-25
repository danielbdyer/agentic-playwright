/**
 * Log-registry architecture laws (W4 / E7).
 *
 * Pin the registry's structural invariants + the
 * "every-entry-has-a-real-writer" gate. Future architecture
 * sweeps will tighten this with "every appendFile/writeFile
 * site routes through a registered writer," but v1 of the
 * law is the basics:
 *
 *   L-Names-Unique:     no two entries share a `name`.
 *   L-Paths-Unique:     no two entries share a `subdirSegment`.
 *   L-Writers-Exist:    every entry's writer file:line points
 *                       at a real file in the tree.
 *   L-Schema-Versioned: every entry has a positive schemaVersion.
 *   L-Format-Closed:    every entry's `format` is in the closed
 *                       union; runtime sanity check.
 */

import { describe, test, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  LOG_REGISTRY,
  REGISTERED_LOG_NAMES,
  findLogEntry,
  type LogFormat,
} from '../../product/domain/logs/log-registry';

const REPO_ROOT = path.resolve(__dirname, '../..');

const ALLOWED_FORMATS: ReadonlySet<LogFormat> = new Set([
  'file-per-record',
  'jsonl-stream',
  'state-with-tmp-rename',
]);

describe('log-registry architecture laws (W4 / E7)', () => {
  test('L-Names-Unique: every entry has a unique name', () => {
    const names = LOG_REGISTRY.map((e) => e.name);
    expect(names).toEqual([...new Set(names)]);
  });

  test('L-Paths-Unique: every entry has a unique subdirSegment', () => {
    const paths = LOG_REGISTRY.map((e) => e.subdirSegment);
    expect(paths).toEqual([...new Set(paths)]);
  });

  test('L-Writers-Exist: every entry points at a real file', () => {
    for (const entry of LOG_REGISTRY) {
      const filePath = entry.writer.split(':')[0]!;
      const absolute = path.join(REPO_ROOT, filePath);
      expect(
        existsSync(absolute),
        `${entry.name}: writer file ${filePath} does not exist (registry entry references missing file)`,
      ).toBe(true);
    }
  });

  test('L-Schema-Versioned: every entry has a positive schemaVersion', () => {
    for (const entry of LOG_REGISTRY) {
      expect(entry.schemaVersion).toBeGreaterThan(0);
      expect(Number.isInteger(entry.schemaVersion)).toBe(true);
    }
  });

  test('L-Format-Closed: every entry uses an allowed format tag', () => {
    for (const entry of LOG_REGISTRY) {
      expect(
        ALLOWED_FORMATS.has(entry.format),
        `${entry.name}: format "${entry.format}" not in allowed set`,
      ).toBe(true);
    }
  });

  test('findLogEntry returns the entry for a known name + null for unknown', () => {
    expect(findLogEntry('improvement-ledger')?.name).toBe('improvement-ledger');
    expect(findLogEntry('nonexistent')).toBeNull();
  });

  test('REGISTERED_LOG_NAMES matches LOG_REGISTRY names', () => {
    expect(REGISTERED_LOG_NAMES).toEqual(LOG_REGISTRY.map((e) => e.name));
  });

  test('sanity: registry has the expected logs from CLAUDE.md', () => {
    // CLAUDE.md enumerates ~9-10 logs. Bound the registry size
    // so a future PR that drops an entry without justification
    // fails the build.
    expect(LOG_REGISTRY.length).toBeGreaterThanOrEqual(9);
    // Spot-check the load-bearing logs by name.
    expect(REGISTERED_LOG_NAMES).toContain('probe-receipts');
    expect(REGISTERED_LOG_NAMES).toContain('hypothesis-receipts');
    expect(REGISTERED_LOG_NAMES).toContain('substrate-snapshots');
    expect(REGISTERED_LOG_NAMES).toContain('improvement-ledger');
    expect(REGISTERED_LOG_NAMES).toContain('compilation-receipts');
  });
});
