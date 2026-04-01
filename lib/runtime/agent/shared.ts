import { uniqueSorted } from '../../domain/kernel/collections';
import { normalizeIntentText } from '../../domain/knowledge/inference';
import type { ResolutionExhaustionEntry, GroundedStep } from '../../domain/types';

export { uniqueSorted };

// Re-export from domain layer — alias matching is a pure inference concern
export { bestAliasMatch, humanizeIdentifier, type AliasMatch } from '../../domain/knowledge/inference';

export function exhaustionEntry(
  stage: ResolutionExhaustionEntry['stage'],
  outcome: ResolutionExhaustionEntry['outcome'],
  reason: string,
  candidates: Pick<ResolutionExhaustionEntry, 'topCandidates' | 'rejectedCandidates'> = {},
): ResolutionExhaustionEntry {
  return { stage, outcome, reason, ...candidates };
}


export function normalizedCombined(task: GroundedStep): string {
  return `${normalizeIntentText(task.actionText)} ${normalizeIntentText(task.expectedText)}`.trim();
}
