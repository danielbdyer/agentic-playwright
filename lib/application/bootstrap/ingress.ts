import { BootstrapInput, createBootstrapInput } from '../../domain/bootstrap';

export interface BootstrapCliInput {
  baseUrl: string;
  suiteIds: string[];
  authStrategy: string;
  crawlBounds: {
    depth: number;
    hostAllowlist: string[];
    timeoutMs: number;
    pageBudget: number;
  };
}

export function validateBootstrapIngress(input: BootstrapCliInput): BootstrapInput {
  return createBootstrapInput({
    baseUrl: input.baseUrl,
    suiteIds: input.suiteIds,
    authStrategy: input.authStrategy,
    crawlBounds: {
      depth: input.crawlBounds.depth,
      hostAllowlist: input.crawlBounds.hostAllowlist,
      timeoutMs: input.crawlBounds.timeoutMs,
      pageBudget: input.crawlBounds.pageBudget,
    },
  });
}
