/**
 * Agnostic reasoning-fill driver (Z11d).
 *
 * The fill leg of record/fill/replay, made substrate-agnostic. The
 * pool is a filesystem queue whose contract is the JSON shape, so
 * the *reasoner* that authors answers is a pluggable dependency:
 * a Claude Code subagent, the GitHub Copilot CLI, an `llm`-style
 * wrapper, a bespoke API client, or a human — anything that maps a
 * prompt to a one-line answer.
 *
 * `fillPool` is a pure orchestrator over an injected `Reasoner`
 * (so it is law-testable with a fake reasoner, no process). It
 * lists the unfilled pending requests, asks the reasoner for each,
 * and writes a `FilledResponse` — recording WHICH reasoner answered
 * and its token cost (metering). The system never trusts the
 * reasoner's vendor: the replay rung independently guards
 * (menu-membership + unique live confirmation + expectedTarget
 * verification), so a different or weaker substrate cannot silently
 * corrupt a result — which makes a *different* vendor a stronger
 * fresh-evaluator for held-out clean-room, not a risk.
 *
 * `commandReasoner` is the universal substrate: it pipes each
 * prompt to an external command on stdin and reads the answer from
 * stdout. Any CLI that honors that contract (or a 2-line wrapper
 * that does) becomes a reasoner with no code change here.
 */

import { spawnSync } from 'node:child_process';
import { listUnfilled, writeFilled } from './reasoning-pool-fs';
import { POOL_NONE, type PendingRequest, type FilledResponse } from '../../../product/domain/reasoning-pool/pool';

/** A reasoner answer (or an error). `text` is the chosen menu item
 *  or POOL_NONE; `model`/`tokens` are provenance + metering. */
export type ReasonerResult =
  | { readonly ok: true; readonly text: string; readonly model: string; readonly tokens?: FilledResponse['tokens'] }
  | { readonly ok: false; readonly error: string };

/** Maps a pending reasoning request to an answer. The agnostic
 *  seam: any substrate implements this. */
export type Reasoner = (request: PendingRequest) => Promise<ReasonerResult>;

export interface FillOutcome {
  readonly fingerprint: string;
  readonly status: 'filled' | 'reasoner-error';
  readonly text?: string;
  readonly model?: string;
  readonly detail?: string;
}

export interface FillPoolOptions {
  readonly poolRootRelative?: string;
  readonly filledBy?: string;
}

/**
 * Drive the fill leg: for every unfilled pending request, ask the
 * reasoner and write the answer. Idempotent — `listUnfilled`
 * already excludes filled fingerprints, so re-running only fills
 * what is new. Pure orchestration; the substrate is the injected
 * `reasoner`.
 */
export async function fillPool(
  rootDir: string,
  reasoner: Reasoner,
  options: FillPoolOptions = {},
): Promise<readonly FillOutcome[]> {
  const pending = listUnfilled(rootDir, options.poolRootRelative);
  const outcomes: FillOutcome[] = [];
  for (const request of pending) {
    const result = await reasoner(request);
    if (!result.ok) {
      outcomes.push({ fingerprint: request.fingerprint, status: 'reasoner-error', detail: result.error });
      continue;
    }
    const filled: FilledResponse = {
      fingerprint: request.fingerprint,
      op: request.op,
      text: result.text,
      model: result.model,
      filledBy: options.filledBy ?? result.model,
      filledAt: new Date().toISOString(),
      ...(result.tokens ? { tokens: result.tokens } : {}),
    };
    writeFilled(rootDir, filled, options.poolRootRelative);
    outcomes.push({ fingerprint: request.fingerprint, status: 'filled', text: result.text, model: result.model });
  }
  return outcomes;
}

/** Normalize a reasoner's raw stdout to a single answer line: last
 *  non-empty line, trimmed, with surrounding quotes stripped (many
 *  CLIs/agents wrap the answer in quotes — the subagent returned
 *  `"Checkboxes"`). Empty output is treated as POOL_NONE so a
 *  silent reasoner becomes an honest refusal, not a crash. */
export function normalizeAnswer(raw: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return POOL_NONE;
  const last = lines[lines.length - 1]!;
  return last.replace(/^["'`]+|["'`]+$/g, '').trim();
}

export interface CommandReasonerOptions {
  /** Model label recorded on the fill (provenance). Defaults to the
   *  command name. */
  readonly model?: string;
  readonly timeoutMs?: number;
}

/**
 * The universal substrate: turn any external CLI into a `Reasoner`.
 * The prompt is piped to the command on stdin; the answer is read
 * from stdout (last non-empty line, dequoted). Examples:
 *
 *   commandReasoner(['copilot', '-p'])           // GitHub Copilot CLI
 *   commandReasoner(['llm', '-m', 'gpt-4o'], { model: 'gpt-4o' })
 *   commandReasoner(['./my-reasoner.sh'])        // any wrapper
 *
 * The command MUST read the prompt on stdin and print the answer
 * (exact menu item, or NONE) on stdout. Vendor flags differ; wrap
 * in a 2-line script if a CLI needs the prompt as an argument.
 */
export function commandReasoner(command: readonly string[], options: CommandReasonerOptions = {}): Reasoner {
  const [bin, ...args] = command;
  const model = options.model ?? bin ?? 'external-command';
  return async (request: PendingRequest): Promise<ReasonerResult> => {
    if (!bin) return { ok: false, error: 'empty command' };
    const proc = spawnSync(bin, args, {
      input: request.prompt,
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (proc.error) return { ok: false, error: `spawn failed: ${proc.error.message}` };
    if (proc.status !== 0) {
      return { ok: false, error: `command exited ${proc.status}: ${(proc.stderr ?? '').slice(0, 300)}` };
    }
    return { ok: true, text: normalizeAnswer(proc.stdout ?? ''), model };
  };
}
