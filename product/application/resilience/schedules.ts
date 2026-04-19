import { Duration, Schedule } from 'effect';

export interface RetryPolicy {
  readonly key: string;
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxElapsedMs: number;
}

export const RETRY_POLICIES = {
  translationTimeout: {
    key: 'translation-timeout',
    maxRetries: 3,
    baseDelayMs: 120,
    maxElapsedMs: 4_000,
  },
  agentInterpreterTimeout: {
    key: 'agent-interpreter-timeout',
    maxRetries: 3,
    baseDelayMs: 180,
    maxElapsedMs: 6_000,
  },
  adoTransient: {
    key: 'ado-transient',
    maxRetries: 4,
    baseDelayMs: 150,
    maxElapsedMs: 8_000,
  },
  dashboardTransient: {
    key: 'dashboard-transient',
    maxRetries: 2,
    baseDelayMs: 80,
    maxElapsedMs: 1_200,
  },
  playwrightBridgeTransient: {
    key: 'playwright-bridge-transient',
    maxRetries: 2,
    baseDelayMs: 120,
    maxElapsedMs: 2_000,
  },
} as const satisfies Readonly<Record<string, RetryPolicy>>;

export interface RetryMetadata {
  readonly policy: string;
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly exhausted: boolean;
}

export function retryScheduleForTaggedErrors<E extends { readonly _tag: string }>(
  policy: RetryPolicy,
  isRetryable: (error: E) => boolean,
): Schedule.Schedule<unknown, E> {
  const withBackoff = Schedule.exponential(Duration.millis(policy.baseDelayMs)).pipe(Schedule.jittered);
  const boundedRetries = Schedule.recurs(policy.maxRetries);
  const boundedElapsed = Schedule.elapsed.pipe(
    Schedule.whileOutput((elapsed) => Duration.toMillis(elapsed) <= policy.maxElapsedMs),
  );

  return Schedule.intersect(withBackoff, Schedule.intersect(boundedRetries, boundedElapsed)).pipe(
    Schedule.whileInput(isRetryable),
  );
}

export function retryMetadata(
  policy: RetryPolicy,
  attempts: number,
  startedAtMs: number,
  exhausted: boolean,
): RetryMetadata {
  return {
    policy: policy.key,
    attempts,
    elapsedMs: Date.now() - startedAtMs,
    exhausted,
  };
}

export function formatRetryMetadata(metadata: RetryMetadata): string {
  return `retry[policy=${metadata.policy}; attempts=${metadata.attempts}; elapsedMs=${metadata.elapsedMs}; exhausted=${metadata.exhausted}]`;
}
