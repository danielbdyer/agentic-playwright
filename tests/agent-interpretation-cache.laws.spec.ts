/**
 * Agent Interpretation Cache — Law-style tests.
 *
 * Laws verified:
 *   1. Key determinism: same inputs produce the same cache key (20 seeds)
 *   2. Collision resistance: different inputs produce different keys
 *   3. Round-trip: write then read returns the original result
 */

import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { agentInterpretationCacheKey, readAgentInterpretationCache, writeAgentInterpretationCache } from '../lib/application/agency/agent-interpretation-cache';
import type { AgentInterpretationCacheKeyInput } from '../lib/application/agency/agent-interpretation-cache';
import type { AgentInterpretationResult } from '../lib/application/agency/agent-interpreter-provider';
import { createProjectPaths } from '../lib/application/paths';
import { FileSystem } from '../lib/application/ports';
import { LocalFileSystem } from '../lib/infrastructure/fs/local-fs';
import { LAW_SEED_COUNT, mulberry32, randomWord } from './support/random';
import { promises as nodeFs } from 'fs';
import path from 'path';
import os from 'os';

// ─── Helpers ───
function withFileSystem<A>(program: Effect.Effect<A, never, FileSystem>): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provideService(FileSystem, LocalFileSystem)));
}

function baseInput(): AgentInterpretationCacheKeyInput {
  return {
    actionText: 'Click the Submit button',
    expectedText: 'Form is submitted',
    normalizedIntent: 'click the submit button => form is submitted',
    taskFingerprint: 'sha256:task-abc',
    knowledgeFingerprint: 'sha256:knowledge-def',
  };
}

function baseResult(): AgentInterpretationResult {
  return {
    interpreted: true,
    target: {
      action: 'click',
      screen: 'form-screen' as any,
      element: 'submitButton' as any,
      posture: null,
      override: null,
      snapshot_template: null,
    },
    confidence: 0.85,
    rationale: 'Matched submit button via heuristic scoring.',
    proposalDrafts: [],
    provider: 'heuristic',
  };
}

function randomInput(next: () => number): AgentInterpretationCacheKeyInput {
  return {
    actionText: randomWord(next) + ' ' + randomWord(next),
    expectedText: randomWord(next) + ' ' + randomWord(next),
    normalizedIntent: randomWord(next) + ' => ' + randomWord(next),
    taskFingerprint: `sha256:${randomWord(next)}`,
    knowledgeFingerprint: `sha256:${randomWord(next)}`,
  };
}

// ─── Law 1: Key Determinism (20 seeds) ───

test('key determinism: same inputs produce the same cache key across 20 seeds', () => {
  const rng = mulberry32(42);
  for (let i = 0; i < LAW_SEED_COUNT; i++) {
    const input = randomInput(rng);
    const keyA = agentInterpretationCacheKey(input);
    const keyB = agentInterpretationCacheKey({ ...input });
    expect(keyA).toBe(keyB);
  }
});

test('key determinism: deep-copied input produces the same key', () => {
  const input = baseInput();
  const copied = JSON.parse(JSON.stringify(input)) as AgentInterpretationCacheKeyInput;
  expect(agentInterpretationCacheKey(input)).toBe(agentInterpretationCacheKey(copied));
});

// ─── Law 2: Collision Resistance ───

test('collision resistance: different actionText produces different key', () => {
  const a = baseInput();
  const b = { ...a, actionText: 'Navigate to settings page' };
  expect(agentInterpretationCacheKey(a)).not.toBe(agentInterpretationCacheKey(b));
});

test('collision resistance: different expectedText produces different key', () => {
  const a = baseInput();
  const b = { ...a, expectedText: 'Settings page is displayed' };
  expect(agentInterpretationCacheKey(a)).not.toBe(agentInterpretationCacheKey(b));
});

test('collision resistance: different taskFingerprint produces different key', () => {
  const a = baseInput();
  const b = { ...a, taskFingerprint: 'sha256:different-task' };
  expect(agentInterpretationCacheKey(a)).not.toBe(agentInterpretationCacheKey(b));
});

test('collision resistance: different knowledgeFingerprint produces different key', () => {
  const a = baseInput();
  const b = { ...a, knowledgeFingerprint: 'sha256:different-knowledge' };
  expect(agentInterpretationCacheKey(a)).not.toBe(agentInterpretationCacheKey(b));
});

test('collision resistance: random inputs produce unique keys (20 seeds)', () => {
  const rng = mulberry32(7);
  const keys = new Set<string>();
  for (let i = 0; i < LAW_SEED_COUNT; i++) {
    keys.add(agentInterpretationCacheKey(randomInput(rng)));
  }
  expect(keys.size).toBe(LAW_SEED_COUNT);
});

// ─── Law 3: Round-trip (write then read) ───

test('round-trip: write then read returns original result', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'agent-cache-test-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const request = baseInput();
    const result = baseResult();

    const written = await withFileSystem(writeAgentInterpretationCache({ paths, request, result }));
    expect(written.kind).toBe('agent-interpretation-cache-record');
    expect(written.payload.result).toEqual(result);

    const read = await withFileSystem(readAgentInterpretationCache({ paths, request }));
    expect(read).not.toBeNull();
    expect(read!.payload.result).toEqual(result);
    expect(read!.cacheKey).toBe(written.cacheKey);
    expect(read!.fingerprints.task).toBe(request.taskFingerprint);
    expect(read!.fingerprints.knowledge).toBe(request.knowledgeFingerprint);
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('round-trip: read returns null for missing key', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'agent-cache-test-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const request = baseInput();
    const read = await withFileSystem(readAgentInterpretationCache({ paths, request }));
    expect(read).toBeNull();
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('round-trip: different knowledge fingerprint does not return stale entry', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'agent-cache-test-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const request = baseInput();
    const result = baseResult();

    await withFileSystem(writeAgentInterpretationCache({ paths, request, result }));

    const staleRequest = { ...request, knowledgeFingerprint: 'sha256:updated-knowledge' };
    const read = await withFileSystem(readAgentInterpretationCache({ paths, request: staleRequest }));
    expect(read).toBeNull();
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});
