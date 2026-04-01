/**
 * Comparison Rules — shared pure functions for resolution receipt comparison.
 *
 * Extracted from replay-evaluation.ts and replay-interpretation.ts to
 * eliminate duplication. Both files had identical targetKey() and similar
 * drift detection logic.
 *
 * These are domain-level pure functions — no IO, no side effects.
 */

import type { ResolutionReceipt } from '../types';

/** Derive a stable comparison key from a resolution receipt's target. Pure. */
export const targetKey = (receipt: ResolutionReceipt): string =>
  receipt.kind === 'needs-human' ? 'needs-human' : JSON.stringify(receipt.target);

/** Derive the exhaustion path from a resolution receipt. Pure. */
export const exhaustionPath = (receipt: ResolutionReceipt): readonly string[] =>
  receipt.exhaustion.map((entry) => `${entry.stage}:${entry.outcome}`);

/** Derive a compact digest of a resolution graph for comparison. Pure. */
export const resolutionGraphDigest = (receipt: ResolutionReceipt): string => {
  const graph = receipt.resolutionGraph;
  if (!graph) return 'none';
  return JSON.stringify({
    traversal: graph.precedenceTraversal.map((entry) => `${entry.rung}:${entry.outcome}`),
    winner: graph.winner,
    refs: graph.refs,
    links: graph.links,
  });
};

/** Compute which fields drifted between two resolution receipts. Pure. */
export const driftFields = (
  original: ResolutionReceipt | null,
  replay: ResolutionReceipt | null,
): readonly string[] => {
  const originalSource = original?.winningSource ?? 'none';
  const replaySource = replay?.winningSource ?? 'none';
  const originalTarget = original ? targetKey(original) : 'none';
  const replayTarget = replay ? targetKey(replay) : 'none';

  return [
    ...(originalSource !== replaySource ? ['winningSource'] : []),
    ...(originalTarget !== replayTarget ? ['target'] : []),
    ...((original?.governance ?? 'approved') !== (replay?.governance ?? 'approved') ? ['governance'] : []),
    ...((original?.confidence ?? 'unbound') !== (replay?.confidence ?? 'unbound') ? ['confidence'] : []),
  ];
};
