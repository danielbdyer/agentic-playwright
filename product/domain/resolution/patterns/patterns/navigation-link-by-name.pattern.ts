/**
 * navigation-link-by-name — resolves click-on-link intents scoped
 * to the navigation landmark.
 *
 * Applicability: verb=click and either an explicit link role hint
 * or the intent is ambiguous (no role) but names something (navigation
 * targets are plausibly links). Matcher is the landmark-scoped
 * lookup.
 *
 * Pure — no Effect imports.
 */

import type { MatcherContext, Pattern } from '../rung-kernel';
import { patternId } from '../rung-kernel';
import { firstMatchWins } from '../orchestrators/first-match-wins';
import { linkInNavLandmarkMatcher } from '../matchers/link-in-nav-landmark';

function isNavClick(ctx: MatcherContext): boolean {
  if (ctx.intent.verb !== 'click') return false;
  const { role, name, nameSubstring } = ctx.intent.targetShape;
  if (role && role !== 'link') return false;
  return Boolean(name ?? nameSubstring);
}

export const navigationLinkByNamePattern: Pattern = {
  id: patternId('navigation-link-by-name'),
  description: 'Resolve click-on-link intents against the navigation landmark',
  applicabilityGuard: isNavClick,
  matchers: [linkInNavLandmarkMatcher],
  orchestrator: firstMatchWins,
};
