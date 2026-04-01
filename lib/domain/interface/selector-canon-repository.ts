import type { SelectorCanon } from '../types';

export interface SelectorCanonLoadResult {
  readonly found: boolean;
  readonly canon: SelectorCanon | null;
}

export interface SelectorCanonRepository {
  readonly load: (absolutePath: string) => Promise<SelectorCanonLoadResult>;
  readonly save: (absolutePath: string, canon: SelectorCanon) => Promise<SelectorCanon>;
}
