import { normalizeIntentText } from '../domain/inference';
import type { TranslationCandidate, TranslationReceipt, TranslationRequest } from '../domain/types';
import { uniqueSorted } from './collections';


function tokenize(value: string): string[] {
  return uniqueSorted(normalizeIntentText(value).split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

function overlapScore(queryTokens: string[], aliases: string[]): number {
  const aliasTokens = uniqueSorted(aliases.flatMap((alias) => tokenize(alias)));
  if (queryTokens.length === 0 || aliasTokens.length === 0) {
    return 0;
  }
  const overlap = queryTokens.filter((token) => aliasTokens.includes(token)).length;
  if (overlap === 0) {
    return 0;
  }
  return Number((overlap / Math.max(queryTokens.length, aliasTokens.length)).toFixed(2));
}

export function translateIntentToOntology(request: TranslationRequest): TranslationReceipt {
  const queryTokens = tokenize(`${request.actionText} ${request.expectedText}`);
  const candidates: TranslationCandidate[] = [];

  for (const screen of request.screens) {
    const screenScore = overlapScore(queryTokens, [...screen.aliases, screen.screen]);
    if (screenScore > 0) {
      candidates.push({
        kind: 'screen',
        target: screen.screen,
        screen: screen.screen,
        aliases: uniqueSorted([...screen.aliases, screen.screen]),
        score: screenScore,
        sourceRefs: request.overlayRefs,
      });
    }

    for (const element of screen.elements) {
      const elementScore = overlapScore(queryTokens, [...element.aliases, element.element]);
      if (elementScore > 0) {
        candidates.push({
          kind: 'element',
          target: `${screen.screen}.${element.element}`,
          screen: screen.screen,
          element: element.element,
          aliases: uniqueSorted([...element.aliases, element.element]),
          score: elementScore,
          sourceRefs: request.overlayRefs,
        });
      }
    }
  }

  const ranked = candidates
    .filter((candidate) => candidate.score >= 0.34)
    .sort((left, right) => {
      const byScore = right.score - left.score;
      if (byScore !== 0) {
        return byScore;
      }
      return left.target.localeCompare(right.target);
    });
  const selected = ranked[0] ?? null;

  return {
    kind: 'translation-receipt',
    version: 1,
    mode: 'structured-translation',
    matched: selected !== null,
    selected,
    candidates: ranked,
    rationale: selected
      ? `Structured translation matched ${selected.target} with score ${selected.score}.`
      : 'Structured translation could not map the step into a known ontology target.',
  };
}
