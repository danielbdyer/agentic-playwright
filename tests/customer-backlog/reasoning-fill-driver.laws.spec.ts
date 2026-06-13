/**
 * Agnostic reasoning-fill driver laws (Cycle 11 / Z11d — ZD3).
 *
 * The fill leg is substrate-agnostic: `fillPool` is a pure
 * orchestrator over an injected `Reasoner`, and `commandReasoner`
 * adapts any external CLI. These laws prove that without binding to
 * any vendor.
 *
 *   ZD3     fillPool asks the reasoner for each unfilled request and
 *           writes a readable FilledResponse.
 *   ZD3.b   idempotent — a second run fills nothing new (already-
 *           filled are excluded).
 *   ZD3.c   a reasoner error is recorded; no fill is written.
 *   ZD3.d   the fill carries the reasoner's model + tokens
 *           (provenance + metering), regardless of substrate.
 *   ZD3.e   normalizeAnswer: last non-empty line, dequoted; empty →
 *           POOL_NONE.
 *   ZD3.f   commandReasoner pipes the prompt to an external command
 *           on stdin and reads the answer from stdout (vendor-
 *           agnostic substrate), dequoting included.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  fillPool,
  commandReasoner,
  normalizeAnswer,
  type Reasoner,
} from '../../workshop/customer-backlog/application/reasoning-fill-driver';
import {
  recordPending,
  readFilled,
} from '../../workshop/customer-backlog/application/reasoning-pool-fs';
import {
  buildPendingRequest,
  POOL_NONE,
  PoolError,
  type FilledResponse,
} from '../../product/domain/reasoning-pool/pool';

function park(root: string, prompt: string): string {
  const pending = buildPendingRequest({
    op: 'synthesize',
    model: 'unbound',
    prompt,
    purpose: 'cohort-candidate-selection',
    context: {},
    createdAt: 'x',
  });
  recordPending(root, pending);
  return pending.fingerprint;
}

describe('Cycle 11 / Z11d — agnostic fill driver (ZD3)', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'fill-driver-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('ZD3: fillPool asks the reasoner per request and writes a readable fill', async () => {
    const fp = park(root, 'pick one');
    const reasoner: Reasoner = async () => ({ ok: true, text: 'Checkboxes', model: 'fake-1' });
    const outcomes = await fillPool(root, reasoner);
    expect(outcomes).toEqual([{ fingerprint: fp, status: 'filled', text: 'Checkboxes', model: 'fake-1' }]);
    const filled = readFilled(root, fp);
    expect(filled).not.toBeInstanceOf(PoolError);
    expect((filled as FilledResponse).text).toBe('Checkboxes');
  });

  test('ZD3.b: idempotent — a second run fills nothing new', async () => {
    park(root, 'pick one');
    const reasoner: Reasoner = async () => ({ ok: true, text: 'X', model: 'fake' });
    expect((await fillPool(root, reasoner)).length).toBe(1);
    expect((await fillPool(root, reasoner)).length).toBe(0);
  });

  test('ZD3.c: a reasoner error is recorded and no fill is written', async () => {
    const fp = park(root, 'pick one');
    const reasoner: Reasoner = async () => ({ ok: false, error: 'boom' });
    const outcomes = await fillPool(root, reasoner);
    expect(outcomes[0]!.status).toBe('reasoner-error');
    expect(readFilled(root, fp)).toBeInstanceOf(PoolError); // not filled
  });

  test('ZD3.d: the fill carries the reasoner model + tokens (metering)', async () => {
    const fp = park(root, 'pick one');
    const reasoner: Reasoner = async () => ({
      ok: true, text: 'Y', model: 'copilot-gpt-4o', tokens: { prompt: 10, completion: 2, total: 12 },
    });
    await fillPool(root, reasoner);
    const filled = readFilled(root, fp) as FilledResponse;
    expect(filled.model).toBe('copilot-gpt-4o');
    expect(filled.tokens?.total).toBe(12);
  });

  test('ZD3.e: normalizeAnswer takes the last non-empty line, dequoted; empty → NONE', () => {
    expect(normalizeAnswer('"Checkboxes"')).toBe('Checkboxes');
    expect(normalizeAnswer('thinking...\n  Dropdown  ')).toBe('Dropdown');
    expect(normalizeAnswer("'NONE'")).toBe('NONE');
    expect(normalizeAnswer('   \n  ')).toBe(POOL_NONE);
  });

  test('ZD3.f: commandReasoner pipes the prompt to an external CLI and reads stdout', async () => {
    const fp = park(root, 'WHICH-IS-IT');
    // A trivial external "reasoner": reads the prompt on stdin and
    // echoes a quoted answer on stdout (proves piping + dequoting).
    const echo = `let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{if(!d.includes('WHICH-IS-IT'))process.exit(2);console.log(JSON.stringify('Checkboxes'));});`;
    const reasoner = commandReasoner(['node', '-e', echo], { model: 'echo-reasoner' });
    const outcomes = await fillPool(root, reasoner);
    expect(outcomes[0]!.status).toBe('filled');
    const filled = readFilled(root, fp) as FilledResponse;
    expect(filled.text).toBe('Checkboxes');
    expect(filled.model).toBe('echo-reasoner');
  });
});
