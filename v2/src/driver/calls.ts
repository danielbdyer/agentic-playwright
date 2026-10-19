/**
 * Every tool the driver uses goes through runtime.invoke, so the batch
 * driver leaves exactly the receipts an interactive host leaves. This is
 * the typed seam over it: a call returns its contract output or the error
 * family, never throws for a tool failure, and stamps each call with the
 * test case and step it serves so the per-test receipt can find it.
 */
import type { ErrorFamily } from '../core/errors.js';
import type { Decision as ReceiptDecision } from '../contract/schemas.js';
import type { ToolInput, ToolName, ToolOutput } from '../contract/tools.js';
import type { Runtime } from '../tools/runtime.js';

export type Outcome<T> =
  | { readonly ok: true; readonly output: T }
  | { readonly ok: false; readonly family: ErrorFamily; readonly message: string; readonly detail?: Readonly<Record<string, unknown>> };

/**
 * A call's input plus the receipt decision. Tools whose schema has no
 * `decision` field strip it on parse; the runtime still reads it from the raw
 * input for the receipt, which is how an observation is attributed to its step.
 */
export type CallInput<N extends ToolName> = ToolInput<N> & { readonly decision?: ReceiptDecision };

export type Caller = <N extends ToolName>(name: N, input: CallInput<N>) => Promise<Outcome<ToolOutput<N>>>;

export const createCaller = (runtime: Runtime, before?: (name: ToolName) => void): Caller =>
  async <N extends ToolName>(name: N, input: CallInput<N>): Promise<Outcome<ToolOutput<N>>> => {
    before?.(name);
    const result = await runtime.invoke(name, input);
    return result.ok
      ? { ok: true, output: result.output as ToolOutput<N> }
      : { ok: false, family: result.error.family, message: result.error.message, ...(result.error.detail !== undefined ? { detail: result.error.detail } : {}) };
  };

/** A case's budget ran out; the step being authored becomes a handoff. */
export class BudgetExhausted extends Error {
  readonly budget: 'wall-clock' | 'tokens';

  constructor(budget: 'wall-clock' | 'tokens', message: string) {
    super(message);
    this.name = 'BudgetExhausted';
    this.budget = budget;
  }
}

/** Tools that author (and so spend the case's budget); handoff, emit, run and publish always go through. */
export const BUDGETED_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  'app.open',
  'app.observe',
  'app.act',
  'app.assert',
  'memory.query',
  'memory.mint',
  'memory.enrich',
]);
