/**
 * Composed CLI registry — the entry-point composition root that merges
 * product/cli/commands/ (the 24 product-owned commands) with
 * workshop/cli/commands/ (the 6 workshop-orchestration commands:
 * benchmark, scorecard, dogfood, evolve, experiments, generate).
 *
 * Per docs/v2-direction.md §§1–2, the CLI is an entry-point concern.
 * Product cannot import workshop (Rule 3); workshop imports from product
 * through manifest-declared verbs + shared contract paths. The CLI's
 * command contract (CommandName union, ParsedFlags, createCommandSpec)
 * lives at product/cli/shared.ts as the shared vocabulary both sides
 * extend. The merged registry is assembled here, at the entry point,
 * and passed into parseCliInvocation.
 *
 * Ship behavior: when the product is packaged for customer distribution,
 * this file + the workshop/cli/ contribution are omitted; customers get
 * only the product-contributed command registry.
 */

import { productCommandRegistry } from '../product/cli/commands/index';
import { workshopCommandRegistry } from '../workshop/cli/commands/index';
import type { CliCommandRegistry } from '../product/cli/registry';

export const composedCliCommandRegistry: CliCommandRegistry = {
  ...productCommandRegistry,
  ...workshopCommandRegistry,
};
