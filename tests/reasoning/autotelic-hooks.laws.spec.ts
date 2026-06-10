/**
 * Autotelic Hook Scripts — Law Tests (Z11d.e, laws ZD5.*)
 *
 * Per docs/v2-live-adapter-plan.md §11:
 *   - ZD5.a — TESSERACT_REASONING_AUTOFILL=off disables every trigger
 *   - ZD5.b — PostToolUse reminder fires only at/above the threshold
 *   - ZD5.c — Stop hook blocks (exit 2) when the pool is non-empty,
 *     passes when empty, and never re-blocks under stop_hook_active
 *   - ZD5.d — UserPromptSubmit injects a reminder only when non-empty
 *
 * The scripts are exercised directly as subprocesses with
 * TESSERACT_REASONING_POOL pointed at temp pools — the same contract
 * Claude Code's hook runner invokes them under.
 */

import { expect, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const HOOKS = {
  postToolUse: path.join(REPO_ROOT, 'scripts/hooks/reasoning-fill-check.sh'),
  stop: path.join(REPO_ROOT, 'scripts/hooks/reasoning-fill-drain-on-stop.sh'),
  userPromptSubmit: path.join(REPO_ROOT, 'scripts/hooks/reasoning-fill-inject-reminder.sh'),
};

interface HookResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runHook(
  script: string,
  options: { pool: string; env?: Record<string, string>; stdin?: string },
): HookResult {
  try {
    const stdout = execFileSync('bash', [script], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
      input: options.stdin ?? '',
      env: {
        ...process.env,
        TESSERACT_REASONING_POOL: options.pool,
        ...options.env,
      },
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: failed.status ?? 1,
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
    };
  }
}

async function makePool(pendingCount: number): Promise<string> {
  const poolDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-pool-'));
  await fs.mkdir(path.join(poolDir, 'pending'), { recursive: true });
  for (let i = 0; i < pendingCount; i += 1) {
    await fs.writeFile(
      path.join(poolDir, 'pending', `${String(i).repeat(8)}.json`),
      '{}',
      'utf8',
    );
  }
  return poolDir;
}

// ─── ZD5.a — kill switch disables every trigger ───

test('ZD5.a TESSERACT_REASONING_AUTOFILL=off silences all three hooks even with a backlog', async () => {
  const pool = await makePool(5);
  const off = { TESSERACT_REASONING_AUTOFILL: 'off' };
  for (const script of Object.values(HOOKS)) {
    const result = runHook(script, { pool, env: off });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr.trim()).toBe('');
  }
});

// ─── ZD5.b — PostToolUse threshold gating ───

test('ZD5.b PostToolUse reminder fires only when pending count reaches the threshold', async () => {
  const below = runHook(HOOKS.postToolUse, { pool: await makePool(2) });
  expect(below.exitCode).toBe(0);
  expect(below.stdout.trim()).toBe('');

  const at = runHook(HOOKS.postToolUse, { pool: await makePool(3) });
  expect(at.exitCode).toBe(0);
  expect(at.stdout).toContain('3 pending fill request(s)');
  expect(JSON.parse(at.stdout) as object).toHaveProperty('hookSpecificOutput');

  const customThreshold = runHook(HOOKS.postToolUse, {
    pool: await makePool(1),
    env: { TESSERACT_REASONING_FILL_THRESHOLD: '1' },
  });
  expect(customThreshold.stdout).toContain('1 pending fill request(s)');
});

test('ZD5.b PostToolUse ignores .tmp- partials and a missing pool dir', async () => {
  const pool = await makePool(0);
  await fs.writeFile(path.join(pool, 'pending', '.tmp-abc-x.json'), '{}', 'utf8');
  const withPartial = runHook(HOOKS.postToolUse, { pool, env: { TESSERACT_REASONING_FILL_THRESHOLD: '1' } });
  expect(withPartial.stdout.trim()).toBe('');

  const missing = runHook(HOOKS.postToolUse, { pool: path.join(os.tmpdir(), 'does-not-exist-pool') });
  expect(missing.exitCode).toBe(0);
  expect(missing.stdout.trim()).toBe('');
});

// ─── ZD5.c — Stop hook blocks on non-empty pool ───

test('ZD5.c Stop hook blocks with exit 2 + guidance when fills are pending, passes when empty', async () => {
  const blocked = runHook(HOOKS.stop, { pool: await makePool(1) });
  expect(blocked.exitCode).toBe(2);
  expect(blocked.stderr).toContain('unfilled request(s)');
  expect(blocked.stderr).toContain('reasoning-fill');

  const clean = runHook(HOOKS.stop, { pool: await makePool(0) });
  expect(clean.exitCode).toBe(0);
});

test('ZD5.c Stop hook never re-blocks while a prior block is being handled (stop_hook_active)', async () => {
  const result = runHook(HOOKS.stop, {
    pool: await makePool(4),
    stdin: '{"stop_hook_active": true}',
  });
  expect(result.exitCode).toBe(0);
});

// ─── ZD5.d — UserPromptSubmit nudge ───

test('ZD5.d UserPromptSubmit injects a reminder only when the pool is non-empty', async () => {
  const nudge = runHook(HOOKS.userPromptSubmit, { pool: await makePool(2) });
  expect(nudge.exitCode).toBe(0);
  expect(nudge.stdout).toContain('2 pending fill request(s)');

  const quiet = runHook(HOOKS.userPromptSubmit, { pool: await makePool(0) });
  expect(quiet.exitCode).toBe(0);
  expect(quiet.stdout.trim()).toBe('');
});
