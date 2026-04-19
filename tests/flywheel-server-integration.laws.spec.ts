import { expect, test } from '@playwright/test';
import {
  journalWriterConfig,
  deriveAct,
} from '../lib/infrastructure/dashboard/journal-writer';
import * as fs from 'node:fs';
import * as path from 'node:path';

test.describe('Journal writer server integration laws', () => {

  test('Law 1: journalWriterConfig applies defaults correctly', () => {
    const config = journalWriterConfig({ journalPath: '/tmp/test.jsonl' });
    expect(config.journalPath).toBe('/tmp/test.jsonl');
    expect(config.flushIntervalMs).toBe(1000);
    expect(config.maxFileSizeBytes).toBe(10_000_000);
  });

  test('Law 2: journalWriterConfig respects overrides', () => {
    const config = journalWriterConfig({
      journalPath: '/tmp/custom.jsonl',
      flushIntervalMs: 500,
      maxFileSizeBytes: 5_000_000,
    });
    expect(config.flushIntervalMs).toBe(500);
    expect(config.maxFileSizeBytes).toBe(5_000_000);
  });

  test('Law 3: deriveAct is consistent with dashboard hook stageToAct for known events', () => {
    // Verify that the server-side deriveAct produces the same results
    // as documented in the spec for all 14 flywheel event types
    const eventToAct: ReadonlyArray<readonly [string, number]> = [
      ['route-navigated', 2],
      ['aria-tree-captured', 2],
      ['surface-discovered', 2],
      ['suite-slice-selected', 3],
      ['scenario-prioritized', 3],
      ['step-bound', 4],
      ['scenario-compiled', 4],
      ['step-executing', 5],
      ['step-resolved', 5],
      ['scenario-executed', 5],
      ['trust-policy-evaluated', 6],
      ['knowledge-activated', 6],
      ['convergence-evaluated', 7],
      ['iteration-summary', 7],
    ];

    eventToAct.forEach(([eventType, expectedAct]) => {
      const act = deriveAct(eventType as any, null);
      expect(act, `${eventType} → act ${expectedAct}`).toBe(expectedAct);
    });
  });

  test('Law 4: server.ts imports journal writer correctly', () => {
    // Verify the server source contains the journal writer import
    const serverSource = fs.readFileSync(
      path.join(__dirname, '..', 'dashboard', 'server.ts'),
      'utf-8',
    );
    expect(serverSource).toContain('subscribeJournalWriter');
    expect(serverSource).toContain('journalWriterConfig');
  });

  test('Law 5: server config has --journal CLI flag handling', () => {
    // Flag parsing moved to dashboard/server/config.ts in the 2026 refactor.
    const configSource = fs.readFileSync(
      path.join(__dirname, '..', 'dashboard', 'server', 'config.ts'),
      'utf-8',
    );
    expect(configSource).toContain("'--journal'");
    expect(configSource).toContain('journalEnabled');
  });

  test('Law 6: server.ts wires journal writer to PubSub event bus', () => {
    const serverSource = fs.readFileSync(
      path.join(__dirname, '..', 'dashboard', 'server.ts'),
      'utf-8',
    );
    // The journal writer should subscribe to the same pubsub as WS broadcaster
    expect(serverSource).toContain('subscribeJournalWriter(bus.pubsub');
  });

  test('Law 7: journal is auto-enabled when --speedrun is active', () => {
    // Auto-enable logic moved to dashboard/server/config.ts.
    const configSource = fs.readFileSync(
      path.join(__dirname, '..', 'dashboard', 'server', 'config.ts'),
      'utf-8',
    );
    // journalEnabled should be true when speedrun is true
    expect(configSource).toMatch(/journalEnabled:\s*journalFlag\s*\|\|\s*speedrun/);
  });

  test('Law 8: journal writer config has 50MB file size limit in server', () => {
    const serverSource = fs.readFileSync(
      path.join(__dirname, '..', 'dashboard', 'server.ts'),
      'utf-8',
    );
    expect(serverSource).toContain('50_000_000');
  });

  test('Law 9: journal path follows .tesseract/runs/{runId}/ convention', () => {
    const serverSource = fs.readFileSync(
      path.join(__dirname, '..', 'dashboard', 'server.ts'),
      'utf-8',
    );
    expect(serverSource).toContain("'.tesseract', 'runs'");
    expect(serverSource).toContain('dashboard-events.jsonl');
  });

  test('Law 10: existing playback API endpoints remain intact', () => {
    // Routing moved to dashboard/server/http-router.ts.
    const routerSource = fs.readFileSync(
      path.join(__dirname, '..', 'dashboard', 'server', 'http-router.ts'),
      'utf-8',
    );
    expect(routerSource).toContain("'/api/runs'");
    expect(routerSource).toContain('/journal');
    expect(routerSource).toContain('/journal/index');
  });
});
