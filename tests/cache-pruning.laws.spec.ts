import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { pruneAgentInterpretationCache, writeAgentInterpretationCache, type AgentInterpretationCacheKeyInput } from '../lib/application/agent/agent-interpretation-cache';
import { createProjectPaths } from '../lib/application/paths';
import { FileSystem } from '../lib/application/ports';
import { pruneTranslationCache, writeTranslationCache } from '../lib/application/execution/translation/translation-cache';
import type { AgentInterpretationResult } from '../lib/application/agent/agent-interpreter-provider';
import type { TranslationRequest, TranslationReceipt } from '../lib/domain/types';
import { createElementId, createScreenId } from '../lib/domain/kernel/identity';
import { LocalFileSystem } from '../lib/infrastructure/fs/local-fs';
import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';

function withFileSystem<A>(program: Effect.Effect<A, never, FileSystem>): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provideService(FileSystem, LocalFileSystem)));
}

function translationRequest(seed: number): TranslationRequest {
  return {
    version: 1,
    taskFingerprint: `sha256:task-${seed}`,
    knowledgeFingerprint: 'sha256:knowledge',
    controlsFingerprint: null,
    normalizedIntent: `intent-${seed}`,
    actionText: `Click button ${seed}`,
    expectedText: `Button ${seed} clicked`,
    allowedActions: ['click'],
    screens: [{
      screen: createScreenId('cache-screen'),
      aliases: [],
      elements: [{
        element: createElementId('button'),
        aliases: [],
        postures: [],
        snapshotTemplates: [],
      }],
    }],
    evidenceRefs: [],
    overlayRefs: [],
  };
}

const translationReceipt: TranslationReceipt = {
  kind: 'translation-receipt',
  version: 1,
  mode: 'structured-translation',
  matched: false,
  selected: null,
  candidates: [],
  rationale: 'cache law test',
};

function interpretationRequest(seed: number): AgentInterpretationCacheKeyInput {
  return {
    actionText: `Action ${seed}`,
    expectedText: `Expected ${seed}`,
    normalizedIntent: `action ${seed} => expected ${seed}`,
    taskFingerprint: `sha256:task-${seed}`,
    knowledgeFingerprint: 'sha256:knowledge',
  };
}

const interpretationResult: AgentInterpretationResult = {
  interpreted: true,
  target: {
    action: 'click',
    screen: createScreenId('cache-screen'),
    element: createElementId('button'),
    posture: null,
    override: null,
    snapshot_template: null,
  },
  confidence: 0.9,
  rationale: 'cache law test',
  proposalDrafts: [],
  provider: 'heuristic',
};

test('translation cache pruning respects maxEntries and is idempotent under limit', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'translation-prune-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const requests = [0, 1, 2, 3].map((seed) => translationRequest(seed));

    await Promise.all(requests.map((request) => withFileSystem(writeTranslationCache({ paths, request, receipt: translationReceipt }))));

    const removed = await withFileSystem(pruneTranslationCache({ paths, maxEntries: 2 }));
    expect(removed).toBe(2);

    const remaining = (await nodeFs.readdir(paths.translationCacheDir)).filter((file) => file.endsWith('.translation.json'));
    expect(remaining.length).toBeLessThanOrEqual(2);

    const removedSecondRun = await withFileSystem(pruneTranslationCache({ paths, maxEntries: 2 }));
    expect(removedSecondRun).toBe(0);
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('agent interpretation cache pruning respects maxEntries and is idempotent under limit', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'agent-prune-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const requests = [0, 1, 2, 3].map((seed) => interpretationRequest(seed));

    await Promise.all(requests.map((request) => withFileSystem(writeAgentInterpretationCache({ paths, request, result: interpretationResult }))));

    const removed = await withFileSystem(pruneAgentInterpretationCache({ paths, maxEntries: 2 }));
    expect(removed).toBe(2);

    const remaining = (await nodeFs.readdir(paths.agentInterpretationCacheDir)).filter((file) => file.endsWith('.agent-interpretation.json'));
    expect(remaining.length).toBeLessThanOrEqual(2);

    const removedSecondRun = await withFileSystem(pruneAgentInterpretationCache({ paths, maxEntries: 2 }));
    expect(removedSecondRun).toBe(0);
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});
