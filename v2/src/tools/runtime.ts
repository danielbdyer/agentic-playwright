/**
 * The runtime both front doors share. The MCP server and the CLI call
 * `invoke(name, rawInput)`; it validates the input against the declaration,
 * runs the handler, checks the output against the contract, maps any failure
 * onto an error family, and appends one authoring receipt. Nothing else in
 * the package writes authoring receipts, so every call is accounted for.
 */
import { z } from 'zod';
import { ToolError, toToolError, type ErrorFamily } from '../core/errors.js';
import { newId } from '../core/hash.js';
import { appendAuthoringReceipt } from '../receipts/receipts.js';
import { pruneSnapshots } from '../observe/store.js';
import { findTool, type ToolInput, type ToolName, type ToolOutput } from '../contract/tools.js';
import type { Decision } from '../contract/schemas.js';
import type { Workspace } from '../workspace/workspace.js';
import type { BrowserPool } from '../browser/types.js';
import type { ToolContext, ToolHandlers } from './types.js';

export type InvokeResult =
  | { readonly ok: true; readonly output: unknown }
  | { readonly ok: false; readonly error: { readonly family: ErrorFamily; readonly message: string; readonly detail?: Readonly<Record<string, unknown>> } };

export interface Runtime {
  readonly ctx: ToolContext;
  invoke(name: string, rawInput: unknown): Promise<InvokeResult>;
  close(): Promise<void>;
}

export interface RuntimeOptions {
  readonly workspace: Workspace;
  readonly browser: BrowserPool;
  readonly handlers: ToolHandlers;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly session?: string;
  readonly log?: (message: string) => void;
  /** Called after every invocation (used by the server to clean up and by tests). */
  readonly onInvoke?: (event: { readonly tool: string; readonly ok: boolean; readonly durationMs: number }) => void;
  readonly closeHooks?: readonly (() => Promise<void>)[];
}

const formatIssues = (error: z.ZodError): string =>
  error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');

const decisionOf = (input: unknown): Decision | undefined => {
  if (input !== null && typeof input === 'object' && 'decision' in input) {
    const parsed = (z.object({ decision: z.unknown() }).safeParse(input));
    if (parsed.success && parsed.data.decision !== undefined && parsed.data.decision !== null && typeof parsed.data.decision === 'object') {
      return parsed.data.decision as Decision;
    }
  }
  return undefined;
};

const testCaseOf = (input: unknown, decision: Decision | undefined): string | undefined => {
  if (decision?.testCase !== undefined) return decision.testCase;
  if (input !== null && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    if (typeof record.testCaseId === 'string') return record.testCaseId;
    const tc = record.testCase;
    if (tc !== null && typeof tc === 'object' && typeof (tc as Record<string, unknown>).id === 'string') return (tc as Record<string, string>).id;
  }
  return undefined;
};

/** HTTP sessions each start a runtime; prune a snapshots directory at most this often per process. */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const lastPruned = new Map<string, number>();

/**
 * Delete snapshot records and screenshots older than the workspace's
 * snapshotRetentionDays (never younger, so cited snapshotIds stay valid).
 * Runs when a runtime starts; never fails the runtime.
 */
const pruneOnStart = async (workspace: Workspace, now: () => Date, log: (message: string) => void): Promise<void> => {
  const at = now().getTime();
  const last = lastPruned.get(workspace.paths.snapshots);
  if (last !== undefined && at >= last && at - last < PRUNE_INTERVAL_MS) return;
  lastPruned.set(workspace.paths.snapshots, at);
  try {
    const removed = await pruneSnapshots(workspace, new Date(at));
    if (removed.length > 0) log(`pruned ${removed.length} snapshot files older than ${workspace.config.snapshotRetentionDays} days`);
  } catch (error) {
    log(`snapshot pruning failed: ${(error as Error).message}`);
  }
};

export const createRuntime = (options: RuntimeOptions): Runtime => {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const session = options.session ?? newId('s', now());
  const log = options.log ?? ((message: string) => process.stderr.write(`[tesseract-qa] ${message}\n`));
  const { workspace, handlers } = options;
  const pruned = pruneOnStart(workspace, now, log);

  const invoke = async (name: string, rawInput: unknown): Promise<InvokeResult> => {
    const started = Date.now();
    const declaration = findTool(name);
    const decision = decisionOf(rawInput);
    const sensitive = new Set<string>();
    const finish = async (result: InvokeResult, rawReceiptInput: unknown): Promise<InvokeResult> => {
      const durationMs = Date.now() - started;
      const toolName = declaration?.name ?? name;
      const input = sensitive.size > 0 && rawReceiptInput !== null && typeof rawReceiptInput === 'object'
        ? Object.fromEntries(Object.entries(rawReceiptInput as Record<string, unknown>).map(([k, v]) => [k, sensitive.has(k) ? '<secret>' : v]))
        : rawReceiptInput;
      try {
        await appendAuthoringReceipt(
          workspace.paths.authoringReceipts,
          {
            at: now().toISOString(),
            session,
            tool: toolName,
            ...(testCaseOf(input, decision) !== undefined ? { testCase: testCaseOf(input, decision)! } : {}),
            ...(decision?.step !== undefined ? { step: decision.step } : {}),
            input,
            ...(result.ok ? { output: result.output } : { message: result.error.message }),
            outcome: result.ok ? 'succeeded' : 'failed',
            ...(result.ok ? {} : { errorFamily: result.error.family }),
            durationMs,
            ...(decision !== undefined
              ? {
                  decision: {
                    ...(decision.chose !== undefined ? { chose: decision.chose } : {}),
                    ...(decision.rejected !== undefined ? { rejected: decision.rejected } : {}),
                    ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
                  },
                  ...(decision.host !== undefined ? { host: decision.host } : {}),
                }
              : {}),
          },
          workspace.config.pii,
        );
      } catch (error) {
        log(`could not write authoring receipt: ${(error as Error).message}`);
      }
      options.onInvoke?.({ tool: toolName, ok: result.ok, durationMs });
      return result;
    };

    if (declaration === undefined) {
      return finish({ ok: false, error: { family: 'invalid-input', message: `unknown tool: ${name}` } }, rawInput);
    }
    const parsed = declaration.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return finish(
        { ok: false, error: { family: 'invalid-input', message: `invalid input for ${declaration.name}: ${formatIssues(parsed.error)}` } },
        rawInput,
      );
    }
    try {
      const handler = handlers[declaration.name as ToolName] as unknown as (input: unknown, ctx: ToolContext) => Promise<unknown>;
      const callCtx: ToolContext = { ...ctx, markSensitive: (field: string) => { sensitive.add(field); } };
      const output = await handler(parsed.data, callCtx);
      const checked = declaration.output.safeParse(output);
      if (!checked.success) {
        log(`${declaration.name} produced output outside its contract: ${formatIssues(checked.error)}`);
        return finish(
          { ok: false, error: { family: 'unclassified', message: `internal error: ${declaration.name} output violates its contract (${formatIssues(checked.error)})` } },
          parsed.data,
        );
      }
      return finish({ ok: true, output }, parsed.data);
    } catch (cause) {
      const error = toToolError(cause);
      if (error.family === 'unclassified' && !(cause instanceof ToolError)) {
        log(`${declaration.name} failed: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`);
      }
      return finish(
        { ok: false, error: { family: error.family, message: error.message, ...(error.detail !== undefined ? { detail: error.detail } : {}) } },
        parsed.data,
      );
    }
  };

  const call = async <N extends ToolName>(name: N, input: ToolInput<N>): Promise<ToolOutput<N>> => {
    const result = await invoke(name, input);
    if (!result.ok) throw new ToolError(result.error.family, result.error.message, result.error.detail as Record<string, unknown> | undefined);
    return result.output as ToolOutput<N>;
  };

  const ctx: ToolContext = { workspace, browser: options.browser, env, now, session, log, call };

  const close = async (): Promise<void> => {
    for (const hook of options.closeHooks ?? []) {
      try {
        await hook();
      } catch (error) {
        log(`close hook failed: ${(error as Error).message}`);
      }
    }
    await options.browser.closeAll();
    await pruned;
  };

  return { ctx, invoke, close };
};
