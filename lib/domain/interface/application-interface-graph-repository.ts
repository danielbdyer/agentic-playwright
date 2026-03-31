import type { ApplicationInterfaceGraph } from '../types';

export interface ApplicationInterfaceGraphLoadResult {
  readonly found: boolean;
  readonly graph: ApplicationInterfaceGraph | null;
}

export interface ApplicationInterfaceGraphRepository {
  readonly load: (absolutePath: string) => Promise<ApplicationInterfaceGraphLoadResult>;
  readonly save: (absolutePath: string, graph: ApplicationInterfaceGraph) => Promise<ApplicationInterfaceGraph>;
}
