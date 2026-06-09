/**
 * Reasoning-Mode CLI + Composition — Law Tests (Z11d.c, laws ZD3.*)
 *
 * Per docs/v2-live-adapter-plan.md §11:
 *   - ZD3.a — `--reasoning-mode` parses each of the 4 values and
 *     rejects unknown values
 *   - ZD3.b/c/d — mode → adapter mapping, observed behaviorally
 *     through the composed Reasoning layer (replay reads only;
 *     record writes pending; live records on miss)
 *   - ZD3.e — mode 'deterministic' composes the existing
 *     deterministic adapter (unchanged provider id)
 *   - ZD3.f — `--reasoning-pool` override propagates into the
 *     composed adapters' pool directory
 */

import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { parseCliInvocation } from '../../product/cli/registry';
import { composedCliCommandRegistry } from '../../bin/cli-registry';
import { createLocalServiceContext } from '../../product/composition/local-services';
import { Reasoning } from '../../product/reasoning/reasoning';
import { deterministicReasoningProviderId } from '../../product/reasoning/adapters';
import type { TranslationRequest } from '../../product/domain/resolution/types';

const SELECT_REQUEST: TranslationRequest = {
  version: 1,
  taskFingerprint: 'tf',
  knowledgeFingerprint: 'kf',
  controlsFingerprint: null,
  normalizedIntent: 'click submit',
  actionText: 'Click submit',
  expectedText: 'submitted',
  allowedActions: ['click'],
  screens: [],
  evidenceRefs: [],
  overlayRefs: [],
} as TranslationRequest;

const selectThroughLayer = (rootDir: string, options: Parameters<typeof createLocalServiceContext>[1]) => {
  const context = createLocalServiceContext(rootDir, options);
  return Effect.runPromise(
    context.provide(
      Effect.gen(function* () {
        const reasoning = yield* Reasoning;
        return yield* reasoning.select(SELECT_REQUEST);
      }),
    ),
  );
};

const interactivePosture = { executionProfile: 'interactive' as const };

// ─── ZD3.a — flag parsing ───

test('ZD3.a --reasoning-mode parses all four values on the compile command', () => {
  for (const mode of ['record', 'replay', 'live', 'deterministic'] as const) {
    const invocation = parseCliInvocation(
      ['compile', '--ado-id', '1001', '--reasoning-mode', mode],
      composedCliCommandRegistry,
    );
    expect(invocation.serviceOptions?.reasoningMode).toBe(mode);
  }
});

test('ZD3.a --reasoning-mode rejects an unknown value', () => {
  expect(() =>
    parseCliInvocation(
      ['compile', '--ado-id', '1001', '--reasoning-mode', 'telepathy'],
      composedCliCommandRegistry,
    ),
  ).toThrow(/Invalid --reasoning-mode/);
});

test('ZD3.f --reasoning-pool parses into serviceOptions', () => {
  const invocation = parseCliInvocation(
    ['compile', '--ado-id', '1001', '--reasoning-mode', 'live', '--reasoning-pool', 'custom-pool'],
    composedCliCommandRegistry,
  );
  expect(invocation.serviceOptions?.reasoningPoolDir).toBe('custom-pool');
});

// ─── ZD3.b/c/d — mode → adapter mapping (behavioral) ───

test('ZD3.c mode=record composes RecordReasoning (pending file lands under the workspace pool)', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-record-'));
  const receipt = await selectThroughLayer(rootDir, { posture: interactivePosture, reasoningMode: 'record' });
  expect(receipt.provider).toBe('claude-code-session');
  expect(receipt.payload.rationale).toContain('needs-fill');
  const pendingDir = path.join(rootDir, '.tesseract', 'reasoning-pool', 'pending');
  const entries = await fs.readdir(pendingDir);
  expect(entries.length).toBe(1);
});

test('ZD3.b mode=replay composes ReplayReasoning (read-only: no pending file on miss)', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-replay-'));
  const receipt = await selectThroughLayer(rootDir, { posture: interactivePosture, reasoningMode: 'replay' });
  expect(receipt.provider).toBe('claude-code-session');
  expect(receipt.payload.matched).toBe(false);
  const pendingDir = path.join(rootDir, '.tesseract', 'reasoning-pool', 'pending');
  const exists = await fs.access(pendingDir).then(() => true, () => false);
  expect(exists).toBe(false);
});

test('ZD3.d mode=live composes the composite (records on miss)', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-live-'));
  const receipt = await selectThroughLayer(rootDir, { posture: interactivePosture, reasoningMode: 'live' });
  expect(receipt.provider).toBe('claude-code-session');
  const pendingDir = path.join(rootDir, '.tesseract', 'reasoning-pool', 'pending');
  const entries = await fs.readdir(pendingDir);
  expect(entries.length).toBe(1);
});

// ─── ZD3.e — deterministic unchanged ───

test('ZD3.e mode=deterministic composes the existing deterministic adapter', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-det-'));
  const receipt = await selectThroughLayer(rootDir, { posture: interactivePosture, reasoningMode: 'deterministic' });
  expect(receipt.provider).toBe(deterministicReasoningProviderId);
});

// ─── ZD3.f — pool override propagates ───

test('ZD3.f reasoningPoolDir override relocates the pool (relative resolves under root)', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-pool-'));
  await selectThroughLayer(rootDir, {
    posture: interactivePosture,
    reasoningMode: 'record',
    reasoningPoolDir: 'custom-pool',
  });
  const entries = await fs.readdir(path.join(rootDir, 'custom-pool', 'pending'));
  expect(entries.length).toBe(1);
});

// ─── ci-batch still wins over reasoningMode ───

test('ci-batch profile overrides reasoningMode with the deterministic adapter', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-ci-'));
  const receipt = await selectThroughLayer(rootDir, {
    posture: { executionProfile: 'ci-batch' },
    reasoningMode: 'live',
  });
  expect(receipt.provider).toBe(deterministicReasoningProviderId);
});
