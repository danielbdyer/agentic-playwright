import { promises as fs } from 'fs';
import path from 'path';
import type { ApplicationInterfaceGraphRepository, ApplicationInterfaceGraphLoadResult } from '../../domain/interface/application-interface-graph-repository';
import type { ApplicationInterfaceGraph } from '../../domain/types';
import { foldApplicationInterfaceGraph } from '../../domain/aggregates/application-interface-graph';
import { validateApplicationInterfaceGraph } from '../../domain/validation';

function asJson(value: ApplicationInterfaceGraph): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const LocalApplicationInterfaceGraphRepository: ApplicationInterfaceGraphRepository = {
  async load(absolutePath: string): Promise<ApplicationInterfaceGraphLoadResult> {
    const found = await fileExists(absolutePath);
    if (!found) {
      return { found: false, graph: null };
    }

    const raw = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    const graph = validateApplicationInterfaceGraph(raw);
    return {
      found: true,
      graph: foldApplicationInterfaceGraph(graph, {
        valid: (candidate) => candidate,
        invalid: (_candidate, report) => {
          throw new Error(`ApplicationInterfaceGraph invariant failure (${JSON.stringify(report)})`);
        },
      }),
    };
  },

  async save(absolutePath: string, graph: ApplicationInterfaceGraph): Promise<ApplicationInterfaceGraph> {
    const validated = foldApplicationInterfaceGraph(graph, {
      valid: (candidate) => candidate,
      invalid: (_candidate, report) => {
        throw new Error(`ApplicationInterfaceGraph invariant failure (${JSON.stringify(report)})`);
      },
    });
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, asJson(validated), 'utf8');
    return validated;
  },
};
