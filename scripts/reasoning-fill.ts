/**
 * Reasoning-pool fill pass (Z11d).
 *
 * The "fill" leg of the record/fill/replay triad
 * (docs/v2-live-adapter-plan.md §1.1): a Claude session reads the
 * pending reasoning requests the cohort recorded, authors a
 * response (the chosen accessible name, or NONE), and writes a
 * FilledResponse the next replay run consumes. Claude IS the
 * adapter — file-mediated, no live LLM API.
 *
 *   npx tsx scripts/reasoning-fill.ts list
 *       — print every unfilled pending request (fingerprint +
 *         prompt) for the session to reason over.
 *
 *   npx tsx scripts/reasoning-fill.ts fill <fingerprint> <answer>
 *       — write a FilledResponse. <answer> is the exact accessible
 *         name chosen from the menu, or NONE.
 *
 * The full autotelic-loop / subagent-dispatch skill (plan §7) is
 * the deferred operational layer; this script is the load-bearing
 * mechanical fill the loop would call.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  listUnfilled,
  poolPaths,
} from '../workshop/customer-backlog/application/reasoning-pool-fs';
import type { FilledResponse } from '../product/domain/reasoning-pool/pool';

const ROOT = process.cwd();
const [, , cmd, ...rest] = process.argv;

function atomicWrite(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

if (cmd === 'list') {
  const pending = listUnfilled(ROOT);
  console.log(JSON.stringify(
    pending.map((p) => ({ fingerprint: p.fingerprint, op: p.op, purpose: p.purpose, prompt: p.prompt })),
    null,
    2,
  ));
} else if (cmd === 'fill') {
  const [fingerprint, ...answerParts] = rest;
  const answer = answerParts.join(' ');
  if (!fingerprint || answer.length === 0) {
    console.error('usage: reasoning-fill.ts fill <fingerprint> <answer>');
    process.exit(1);
  }
  const { filledDir } = poolPaths(ROOT);
  const filled: FilledResponse = {
    fingerprint: fingerprint as FilledResponse['fingerprint'],
    op: 'synthesize',
    text: answer,
    model: 'claude-code-session',
    filledBy: 'claude-code-session',
    filledAt: new Date().toISOString(),
  };
  const file = path.join(filledDir, `${fingerprint}.json`);
  atomicWrite(file, `${JSON.stringify(filled, null, 2)}\n`);
  console.log(`filled ${fingerprint} → ${JSON.stringify(answer)}`);
} else {
  console.error("usage: reasoning-fill.ts <list | fill <fingerprint> <answer>>");
  process.exit(1);
}
