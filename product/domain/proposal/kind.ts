/**
 * Proposal kind — top-level discriminator on every proposal in the
 * system. Added at Step 2 because the manifest is the first
 * governed surface, and every manifest change from this point
 * onward must carry a hypothesis (per `docs/v2-direction.md §6
 * Step 2`).
 *
 * The three kinds:
 *
 *   - `hypothesis` — a proposal that predicts a specific metric
 *     delta. The metric-verification loop records the actual delta
 *     against the prediction and writes a verification receipt.
 *     Every manifest-signature change is a hypothesis.
 *
 *   - `revision` — a proposal that updates an existing canonical
 *     artifact without an experimental claim (e.g., correcting a
 *     typo in a facet's displayName, reordering locator strategies
 *     based on drift evidence). Passes through the trust-policy
 *     gate but does not register a hypothesis receipt.
 *
 *   - `candidate` — a proposal for a brand-new canonical artifact
 *     (e.g., first observation of a previously-unknown screen
 *     element). Becomes the first entry at its address once the
 *     trust-policy gate approves it.
 *
 * The discriminator lives OUTSIDE the proposal FSM — the FSM is
 * orthogonal state ('pending' / 'activated' / 'blocked'). A
 * hypothesis can be pending, an activated revision can still be
 * measured for confirmation-rate purposes, and so on.
 *
 * Pure domain — no Effect, no IO.
 */

export type ProposalKind = 'hypothesis' | 'revision' | 'candidate';

/** Predicted metric delta accompanying a hypothesis proposal. */
export interface PredictedDelta {
  /** Manifest verb name for the metric (e.g.,
   *  `metric-hypothesis-confirmation-rate`). */
  readonly metric: string;
  /** Direction the hypothesis predicts the metric will move. */
  readonly direction: 'increase' | 'decrease' | 'stable';
  /** Optional magnitude (absolute or relative); units are metric-
   *  specific. */
  readonly magnitude?: number;
}

/** Envelope that wraps any proposal payload with the Step 2
 *  discriminator. The `payload` type parameter is intentionally
 *  left generic — existing proposal shapes (DiscoveryProposal,
 *  RouteKnowledgeProposal, etc.) nest inside `payload` unchanged. */
export interface ProposalEnvelope<Payload> {
  readonly kind: ProposalKind;
  /** Rationale the author (agent or operator) attaches when creating
   *  the proposal. */
  readonly rationale: string;
  /** Present on `kind: 'hypothesis'`, absent on `'revision'` and
   *  `'candidate'`. Enforced at construction via the narrow factory
   *  helpers below. */
  readonly predictedDelta?: PredictedDelta;
  /** The domain-specific proposal payload being wrapped. */
  readonly payload: Payload;
}

/** Construct a hypothesis envelope. Requires a predictedDelta so
 *  the verification loop has something to measure against. */
export function hypothesisEnvelope<Payload>(
  rationale: string,
  predictedDelta: PredictedDelta,
  payload: Payload,
): ProposalEnvelope<Payload> {
  return { kind: 'hypothesis', rationale, predictedDelta, payload };
}

/** Construct a revision envelope. No predictedDelta. */
export function revisionEnvelope<Payload>(
  rationale: string,
  payload: Payload,
): ProposalEnvelope<Payload> {
  return { kind: 'revision', rationale, payload };
}

/** Construct a candidate envelope. No predictedDelta. */
export function candidateEnvelope<Payload>(
  rationale: string,
  payload: Payload,
): ProposalEnvelope<Payload> {
  return { kind: 'candidate', rationale, payload };
}

/** Exhaustive fold over the three kinds. Enforces compile-time
 *  handling of every variant — the pattern the rest of
 *  `product/domain/` uses for its discriminated unions. */
export function foldProposalKind<R>(
  kind: ProposalKind,
  cases: {
    readonly hypothesis: () => R;
    readonly revision: () => R;
    readonly candidate: () => R;
  },
): R {
  switch (kind) {
    case 'hypothesis':
      return cases.hypothesis();
    case 'revision':
      return cases.revision();
    case 'candidate':
      return cases.candidate();
  }
}
