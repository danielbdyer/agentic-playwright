import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { createAdoId } from '../../domain/identity';
import { graphIds } from '../../domain/ids';
import { DerivedGraph } from '../../domain/types';
import { validateDerivedGraph } from '../../domain/validation';

export type FailureClassification =
  | 'locator-ambiguous'
  | 'locator-timeout'
  | 'locator-degraded'
  | 'structural-mismatch'
  | 'assertion-mismatch'
  | 'interaction-timeout'
  | 'navigation-failure'
  | 'data-setup-failure'
  | 'runtime-domain'
  | 'unknown';


function runtimeCodeFromMessage(message: string): string | undefined {
  const match = message.match(/\[(runtime-[^\]]+)\]/i);
  return match?.[1]?.toLowerCase();
}

export function classifyFailure(message: string): FailureClassification {
  const normalized = message.toLowerCase();
  if (normalized.includes('strict mode violation')) return 'locator-ambiguous';
  if (normalized.includes('to match aria snapshot')) return 'structural-mismatch';
  if (normalized.includes('timed out')) return 'locator-timeout';
  if (normalized.includes('expect(')) return 'assertion-mismatch';
  if (normalized.includes('goto')) return 'navigation-failure';
  if (runtimeCodeFromMessage(message)) return 'runtime-domain';
  return 'unknown';
}

function readDerivedGraph(rootDir: string): DerivedGraph | undefined {
  const target = path.join(rootDir, '.tesseract', 'graph', 'index.json');
  if (!existsSync(target)) {
    return undefined;
  }

  const raw = JSON.parse(readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
  return validateDerivedGraph(raw);
}

export function findFailureContext(graph: DerivedGraph | undefined, adoId: string | undefined): { scenario?: string; relatedNodes: string[] } {
  if (!graph || !adoId) {
    return { relatedNodes: [] };
  }

  const scenarioNodeId = graphIds.scenario(createAdoId(adoId));
  const scenarioExists = graph.nodes.some((node) => node.id === scenarioNodeId);
  if (!scenarioExists) {
    return { relatedNodes: [] };
  }

  const relatedNodes = new Set<string>([scenarioNodeId]);
  for (const edge of graph.edges) {
    if (edge.from === scenarioNodeId || edge.to === scenarioNodeId) {
      relatedNodes.add(edge.from);
      relatedNodes.add(edge.to);
    }
  }

  return {
    scenario: scenarioNodeId,
    relatedNodes: [...relatedNodes].sort((left, right) => left.localeCompare(right)),
  };
}

export class TesseractReporter implements Reporter {
  private rootDir = process.cwd();
  private graph: DerivedGraph | undefined;

  onBegin(config: FullConfig, _suite: Suite): void {
    this.rootDir = config.rootDir;
    this.graph = readDerivedGraph(this.rootDir);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'failed' && result.error?.message) {
      const classification = classifyFailure(result.error.message);
      const adoId = test.annotations.find((annotation) => annotation.type === 'ado-id')?.description;
      const context = findFailureContext(this.graph, adoId);
      const runtimeDiagnostic = test.annotations.find((annotation) => annotation.type === 'runtime-diagnostic')?.description;
      const runtimeSuffix = runtimeDiagnostic ? ` [runtime=${runtimeDiagnostic}]` : '';
      const suffix = context.relatedNodes.length > 0 ? ` [graph=${context.relatedNodes.join(', ')}]` : '';
      process.stderr.write(`[tesseract-reporter] ${classification}: ${result.error.message}${suffix}${runtimeSuffix}\n`);
    }
  }

  onEnd(_result: FullResult): void {}
}

export default TesseractReporter;


