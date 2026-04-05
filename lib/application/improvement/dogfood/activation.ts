import { isPending } from '../../../domain/proposal/lifecycle';
import type { ProposalBundle } from '../../../domain/execution/types';

export function collectPendingProposals(bundles: readonly ProposalBundle[]): readonly ProposalBundle[] {
  return bundles.filter((bundle) =>
    bundle.payload.proposals.some((proposal) => isPending(proposal.activation)),
  );
}
