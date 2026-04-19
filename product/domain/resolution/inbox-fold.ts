/**
 * Exhaustive fold for `OperatorInboxItemKind`.
 *
 * The 6-case `OperatorInboxItem.kind` discriminator was previously
 * scattered across `product/application/agency/operator.ts` as 5 separate
 * `switch` blocks (`requestedParticipation`, `blockageType`, `blastRadius`,
 * `requiredCapabilities`, `requiredAuthorities`). The same shape recurs
 * across MCP and projection consumers.
 *
 * This fold mirrors `foldGovernance` and `foldEpistemicStatus`. Adding
 * a new variant to `OperatorInboxItemKind` will break the build at every
 * fold call site, making the migration explicit and exhaustive.
 *
 * Pattern alignment: Visitor over a closed sum type. Pure domain.
 */

import type { OperatorInboxItem, OperatorInboxItemKind } from './types';

export interface OperatorInboxKindCases<R> {
  readonly proposal: (item: OperatorInboxItem) => R;
  readonly blockedPolicy: (item: OperatorInboxItem) => R;
  readonly degradedLocator: (item: OperatorInboxItem) => R;
  readonly needsHuman: (item: OperatorInboxItem) => R;
  readonly approvedEquivalent: (item: OperatorInboxItem) => R;
  readonly recovery: (item: OperatorInboxItem) => R;
}

/**
 * Exhaustive fold over `OperatorInboxItemKind`. Compiler-checked
 * exhaustiveness — adding a new variant breaks the build here AND at
 * every consumer.
 */
export function foldOperatorInboxKind<R>(
  item: OperatorInboxItem,
  cases: OperatorInboxKindCases<R>,
): R {
  switch (item.kind) {
    case 'proposal':            return cases.proposal(item);
    case 'blocked-policy':      return cases.blockedPolicy(item);
    case 'degraded-locator':    return cases.degradedLocator(item);
    case 'needs-human':         return cases.needsHuman(item);
    case 'approved-equivalent': return cases.approvedEquivalent(item);
    case 'recovery':            return cases.recovery(item);
  }
}

/** All inbox kinds in canonical order. Useful for tests and exhaustiveness. */
export const ALL_OPERATOR_INBOX_KINDS: readonly OperatorInboxItemKind[] = [
  'proposal', 'blocked-policy', 'degraded-locator', 'needs-human', 'approved-equivalent', 'recovery',
] as const;
