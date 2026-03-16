import { normalizeIntentText } from '../../domain/inference';
import type { ResolutionExhaustionEntry, GroundedStep } from '../../domain/types';

export interface AliasMatch {
  alias: string;
  score: number;
}

export function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)) as T[];
}

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

export function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function bestAliasMatch(normalizedText: string, aliases: string[]): AliasMatch | null {
  let best: AliasMatch | null = null;
  for (const alias of uniqueSorted(aliases.map((entry) => normalizeIntentText(entry)))) {
    if (!alias || !normalizedText.includes(alias)) {
      continue;
    }
    const candidate: AliasMatch = { alias, score: alias.length };
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }
  return best;
}
