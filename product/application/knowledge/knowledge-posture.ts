/**
 * Knowledge Posture Resolution
 *
 * Resolves the active KnowledgePosture from explicit override (CLI flag,
 * programmatic option), defaulting to 'warm-start' when nothing is
 * supplied.
 *
 * Posture is configuration for HOW the loop runs (which canonical
 * artifact slots are consulted by the lookup chain), not data about the
 * SUT. Per the canon-and-derivation doctrine
 * (docs/canon-and-derivation.md), this kind of config does not belong in
 * a persistent file — it belongs on the command. The legacy
 * `posture.yaml` file concept has been removed; posture is now
 * CLI-only.
 */

import type { KnowledgePosture } from '../../domain/governance/workflow-types';

/**
 * Resolve the active knowledge posture for a suite.
 *
 * Precedence:
 *   1. Explicit override (from CLI flag or programmatic option)
 *   2. 'warm-start' (default)
 */
export function resolveKnowledgePosture(
  explicitOverride?: KnowledgePosture | undefined,
): KnowledgePosture {
  return explicitOverride ?? 'warm-start';
}
