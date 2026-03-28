// ─── Progress Reporting (W3.11) ───
//
// Pure functions for creating, formatting, and serializing progress events
// emitted during the dogfood loop. These are observability-only utilities —
// they never gate pipeline execution.

/**
 * A structured progress event emitted at phase boundaries and after
 * each dogfood iteration. Designed for both human-readable stderr
 * output and machine-readable JSONL persistence.
 */
export interface ProgressEvent {
  readonly phase: string;
  readonly iteration: number;
  readonly completedScenarios: number;
  readonly totalScenarios: number;
  readonly currentMetrics: Readonly<Record<string, number>>;
  readonly elapsed: number;
  readonly estimatedRemaining: number | null;
}

/**
 * Create a ProgressEvent with sensible defaults for optional fields.
 * Only `totalScenarios` is required; all other fields default to zero
 * or empty values.
 */
export function createProgressEvent(
  partial: Partial<ProgressEvent> & { readonly totalScenarios: number },
): ProgressEvent {
  return {
    phase: partial.phase ?? 'unknown',
    iteration: partial.iteration ?? 0,
    completedScenarios: partial.completedScenarios ?? 0,
    totalScenarios: partial.totalScenarios,
    currentMetrics: partial.currentMetrics ?? {},
    elapsed: partial.elapsed ?? 0,
    estimatedRemaining: partial.estimatedRemaining ?? null,
  };
}

/**
 * Format a progress event as a human-readable single line for stderr.
 * Includes phase, iteration, and completion fraction.
 */
export function formatProgressLine(event: ProgressEvent): string {
  const pct = event.totalScenarios > 0
    ? Math.round((event.completedScenarios / event.totalScenarios) * 100)
    : 0;
  const remaining = event.estimatedRemaining !== null
    ? ` ~${Math.round(event.estimatedRemaining / 1000)}s remaining`
    : '';
  return `[${event.phase}] iteration ${event.iteration}: ${event.completedScenarios}/${event.totalScenarios} (${pct}%) elapsed ${Math.round(event.elapsed / 1000)}s${remaining}`;
}

/**
 * Serialize a progress event to a single JSON line for persistence
 * in `.tesseract/runs/` sidecar files.
 */
export function serializeProgress(event: ProgressEvent): string {
  return JSON.stringify(event);
}

/**
 * Estimate remaining time based on completed work and elapsed time.
 * Returns null when no work has been completed (division by zero).
 */
export function estimateRemaining(
  completed: number,
  total: number,
  elapsed: number,
): number | null {
  if (completed <= 0) {
    return null;
  }
  const remaining = total - completed;
  const ratePerItem = elapsed / completed;
  return remaining * ratePerItem;
}
