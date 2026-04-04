import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const TYPES_DIR = path.join(ROOT, 'lib', 'domain', 'types');

const CONTEXT_FILES = [
  'shared-context.ts',
  'intent-context.ts',
  'knowledge-context.ts',
  'resolution-context.ts',
  'execution-context.ts',
  'intervention-context.ts',
  'improvement-context.ts',
  'interface-context.ts',
] as const;

const OWNERSHIP: Readonly<Record<string, string>> = {
  'workflow.ts': 'shared',
  'intent.ts': 'intent',
  'routes.ts': 'intent',
  'route-knowledge.ts': 'intent',
  'knowledge.ts': 'knowledge',
  'semantic-dictionary.ts': 'knowledge',
  'contradiction.ts': 'knowledge',
  'affordance.ts': 'knowledge',
  'widgets.ts': 'knowledge',
  'resolution.ts': 'resolution',
  'pipeline-config.ts': 'resolution',
  'agent-interpreter.ts': 'resolution',
  'execution.ts': 'execution',
  'projection.ts': 'execution',
  'intervention.ts': 'intervention',
  'session.ts': 'intervention',
  'workbench.ts': 'intervention',
  'dashboard.ts': 'intervention',
  'improvement.ts': 'improvement',
  'learning.ts': 'improvement',
  'fitness.ts': 'improvement',
  'experiment.ts': 'improvement',
  'architecture-fitness.ts': 'improvement',
  'convergence-proof.ts': 'improvement',
  'interface.ts': 'interface',
};

function read(file: string): string {
  return fs.readFileSync(path.join(TYPES_DIR, file), 'utf8');
}

test('bounded barrels stay below max re-export count', () => {
  const maxReExportsPerBarrel = 6;

  for (const barrel of CONTEXT_FILES) {
    const content = read(barrel);
    const count = (content.match(/export\s+\*\s+from\s+['"]/g) ?? []).length;
    expect(count, `${barrel} exceeds max re-export count`).toBeLessThanOrEqual(maxReExportsPerBarrel);
  }
});

test('no deep ad-hoc type imports from application/runtime/infrastructure', () => {
  const targetDirs = ['lib/application', 'lib/runtime', 'lib/infrastructure'] as const;

  const walkTs = (dir: string): readonly string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walkTs(full) : entry.name.endsWith('.ts') ? [full] : [];
    });

  const tsFiles = targetDirs.flatMap((dir) => walkTs(path.join(ROOT, dir)));

  const offenders = tsFiles.flatMap((filePath) => {
    const rel = path.relative(ROOT, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = [...content.matchAll(/from\s+['"]([^'"]*domain\/types\/[^'"]+)['"]/g)].map((m) => m[1]!);
    return matches
      .filter((imp) => !imp.endsWith('/types') && !imp.endsWith('-context'))
      .map((imp) => `${rel} -> ${imp}`);
  });

  expect(offenders).toEqual([]);
});

test('all leaf type modules are owned by a bounded context', () => {
  const files = fs
    .readdirSync(TYPES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => !file.endsWith('-context.ts'));

  const excluded = new Set(['index.ts']);
  const leafFiles = files.filter((file) => !excluded.has(file));

  const unclassified = leafFiles.filter((file) => file !== 'shared-context.ts' && !Object.hasOwn(OWNERSHIP, file));
  expect(unclassified).toEqual([]);
});
