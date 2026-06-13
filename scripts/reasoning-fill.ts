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
 *       — write a FilledResponse by hand. <answer> is the exact
 *         accessible name from the menu, or NONE.
 *
 *   npx tsx scripts/reasoning-fill.ts fill-via [--model NAME] -- <command> [args...]
 *       — AGNOSTIC autonomous fill: pipe each pending prompt to an
 *         external reasoner on stdin and capture its answer on
 *         stdout. Works with any CLI honoring that contract:
 *           fill-via -- copilot -p
 *           fill-via --model gpt-4o -- llm -m gpt-4o
 *           fill-via -- ./my-reasoner.sh
 *         The reasoner is indifferent to substrate; the replay
 *         rung's guards (menu-membership, unique live confirmation,
 *         expectedTarget verification) keep a wrong/weaker vendor
 *         from silently corrupting a result.
 *
 * The full autotelic-loop cadence (plan §7) is the deferred
 * operational layer; this script is the load-bearing fill it calls,
 * and `fill-via` is the vendor-agnostic dispatcher.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  listUnfilled,
  poolPaths,
} from '../workshop/customer-backlog/application/reasoning-pool-fs';
import {
  fillPool,
  commandReasoner,
} from '../workshop/customer-backlog/application/reasoning-fill-driver';
import type { FilledResponse } from '../product/domain/reasoning-pool/pool';

const ROOT = process.cwd();
const [, , cmd, ...rest] = process.argv;

function atomicWrite(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

/** Split `[--model NAME] -- <command...>` into the model + command. */
function parseFillViaArgs(args: readonly string[]): { model: string | undefined; command: string[] } {
  let model: string | undefined;
  let i = 0;
  while (i < args.length && args[i] !== '--') {
    if (args[i] === '--model') { model = args[i + 1]; i += 2; } else { i += 1; }
  }
  const command = args[i] === '--' ? args.slice(i + 1) : [];
  return { model, command };
}

async function main(): Promise<void> {
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
      model: 'manual',
      filledBy: 'manual',
      filledAt: new Date().toISOString(),
    };
    atomicWrite(path.join(filledDir, `${fingerprint}.json`), `${JSON.stringify(filled, null, 2)}\n`);
    console.log(`filled ${fingerprint} → ${JSON.stringify(answer)}`);
  } else if (cmd === 'fill-via') {
    const { model, command } = parseFillViaArgs(rest);
    if (command.length === 0) {
      console.error('usage: reasoning-fill.ts fill-via [--model NAME] -- <command> [args...]');
      process.exit(1);
    }
    const reasoner = commandReasoner(command, model !== undefined ? { model } : {});
    const outcomes = await fillPool(ROOT, reasoner, { filledBy: command.join(' ') });
    console.log(JSON.stringify({ command, model: model ?? command[0], outcomes }, null, 2));
    if (outcomes.some((o) => o.status === 'reasoner-error')) process.exit(1);
  } else {
    console.error('usage: reasoning-fill.ts <list | fill <fingerprint> <answer> | fill-via [--model NAME] -- <command...>>');
    process.exit(1);
  }
}

void main();
