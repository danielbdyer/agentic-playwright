import { Effect, FiberRef } from 'effect';

export interface ExecutionFiberContext {
  readonly adoId?: string | undefined;
  readonly runId?: string | undefined;
  readonly stage?: string | undefined;
  readonly iteration?: number | undefined;
  readonly workItemId?: string | undefined;
}

const executionContextRef = FiberRef.unsafeMake<ExecutionFiberContext>({});

function withDefinedContextEntries(context: ExecutionFiberContext): ExecutionFiberContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  ) as ExecutionFiberContext;
}

export function mergeExecutionContext<TData extends Record<string, unknown>>(
  data: TData,
  context: ExecutionFiberContext,
): TData & ExecutionFiberContext {
  const enriched: Record<string, unknown> = { ...data };
  const definedContext = withDefinedContextEntries(context);

  for (const [key, value] of Object.entries(definedContext)) {
    if (enriched[key] === undefined) {
      enriched[key] = value;
    }
  }

  return enriched as TData & ExecutionFiberContext;
}

export function getExecutionContext(): Effect.Effect<ExecutionFiberContext> {
  return FiberRef.get(executionContextRef);
}

export function withExecutionContext(context: ExecutionFiberContext) {
  const patch = withDefinedContextEntries(context);
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.locallyWith(effect, executionContextRef, (current) => ({
      ...current,
      ...patch,
    }));
}

export function enrichEventDataWithExecutionContext(data: unknown): Effect.Effect<unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return Effect.succeed(data);
  }

  return Effect.map(getExecutionContext(), (context) => mergeExecutionContext(data as Record<string, unknown>, context));
}
