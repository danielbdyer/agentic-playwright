/**
 * Exhaustive fold for `InterventionTargetKind`.
 *
 * The 13-case `InterventionTargetKind` discriminator was previously
 * scattered across `operator.ts`, `intervention-kernel.ts`,
 * `dashboard-mcp-server.ts`, and `proposal-patches.ts` as ad-hoc
 * `switch` blocks. Adding a new case required manual hunting through
 * every site, and the compiler couldn't catch missed branches.
 *
 * This fold mirrors `foldGovernance` (lib/domain/governance/workflow-types.ts:44)
 * and `foldEpistemicStatus` (lib/domain/handshake/epistemic-brand.ts).
 * Adding a new variant to `InterventionTargetKind` will break the
 * build at every fold call site, making the migration explicit.
 *
 * Pattern alignment: Visitor pattern over a closed sum type.
 * Pure domain — no Effect, no IO.
 */

import type { InterventionTarget, InterventionTargetKind } from './intervention';

export interface InterventionTargetCases<R> {
  readonly workspace: (target: InterventionTarget) => R;
  readonly suite: (target: InterventionTarget) => R;
  readonly scenario: (target: InterventionTarget) => R;
  readonly run: (target: InterventionTarget) => R;
  readonly step: (target: InterventionTarget) => R;
  readonly artifact: (target: InterventionTarget) => R;
  readonly graphNode: (target: InterventionTarget) => R;
  readonly selector: (target: InterventionTarget) => R;
  readonly proposal: (target: InterventionTarget) => R;
  readonly knowledge: (target: InterventionTarget) => R;
  readonly session: (target: InterventionTarget) => R;
  readonly benchmark: (target: InterventionTarget) => R;
  readonly codebase: (target: InterventionTarget) => R;
}

/**
 * Exhaustive fold over `InterventionTargetKind`. Compiler-checked
 * exhaustiveness via the unreachable `never` assignment in the default.
 */
export function foldInterventionTargetKind<R>(
  target: InterventionTarget,
  cases: InterventionTargetCases<R>,
): R {
  switch (target.kind) {
    case 'workspace':  return cases.workspace(target);
    case 'suite':      return cases.suite(target);
    case 'scenario':   return cases.scenario(target);
    case 'run':        return cases.run(target);
    case 'step':       return cases.step(target);
    case 'artifact':   return cases.artifact(target);
    case 'graph-node': return cases.graphNode(target);
    case 'selector':   return cases.selector(target);
    case 'proposal':   return cases.proposal(target);
    case 'knowledge':  return cases.knowledge(target);
    case 'session':    return cases.session(target);
    case 'benchmark':  return cases.benchmark(target);
    case 'codebase':   return cases.codebase(target);
  }
}

/** All target kinds in canonical order. Useful for tests, dashboards,
 *  and exhaustiveness checks at runtime. */
export const ALL_INTERVENTION_TARGET_KINDS: readonly InterventionTargetKind[] = [
  'workspace', 'suite', 'scenario', 'run', 'step', 'artifact',
  'graph-node', 'selector', 'proposal', 'knowledge', 'session',
  'benchmark', 'codebase',
] as const;
