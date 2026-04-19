import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const DOMAIN_DIR = path.join(ROOT, 'product', 'domain');

/** Bounded contexts that must have an index.ts barrel. */
const EXPECTED_BARRELS = [
  'agency', 'algebra', 'attention', 'codegen', 'commitment', 'confidence',
  'convergence', 'drift', 'evidence', 'fitness', 'governance', 'graph',
  'handshake', 'improvement', 'intent', 'interface', 'interpretation',
  'kernel', 'knowledge', 'learning', 'observation', 'projection', 'proposal',
  'provenance', 'resolution', 'scenario', 'schemas', 'synthesis', 'target',
  'validation', 'widgets',
];

test('bounded barrels stay below max re-export count', () => {
  const maxReExportsPerBarrel = 15;

  for (const ctx of EXPECTED_BARRELS) {
    const barrelPath = path.join(DOMAIN_DIR, ctx, 'index.ts');
    if (!fs.existsSync(barrelPath)) continue;
    const content = fs.readFileSync(barrelPath, 'utf8');
    const count = (content.match(/export\s+\*\s+from\s+['"]/g) ?? []).length;
    expect(count, `domain/${ctx}/index.ts exceeds max re-export count`).toBeLessThanOrEqual(maxReExportsPerBarrel);
  }
});

test('no deep ad-hoc type imports from application/runtime/infrastructure into old domain/types/', () => {
  const targetDirs = ['product/application', 'product/runtime', 'product/instruments'] as const;

  const walkTs = (dir: string): readonly string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walkTs(full) : entry.name.endsWith('.ts') ? [full] : [];
    });

  const tsFiles = targetDirs.flatMap((dir) => walkTs(path.join(ROOT, dir)));

  // Ensure no code still imports from the old flat domain/types/ path
  const offenders = tsFiles.flatMap((filePath) => {
    const rel = path.relative(ROOT, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = [...content.matchAll(/from\s+['"]([^'"]*domain\/types\/[^'"]+)['"]/g)].map((m) => m[1]!);
    return matches.map((imp) => `${rel} -> ${imp}`);
  });

  expect(offenders).toEqual([]);
});

test('all leaf type modules are owned by a bounded context', () => {
  // After decomposition, every .ts file under product/domain/ must live inside a
  // bounded-context subdirectory — no orphan files at the domain root.
  const topLevelFiles = fs
    .readdirSync(DOMAIN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name);

  // Known root-level files that predate full decomposition.
  // This set must not grow — new files should go into a bounded context.
  const allowed = new Set(['index.ts', 'validation.ts']);
  const orphans = topLevelFiles.filter((file) => !allowed.has(file));
  expect(orphans, 'orphan .ts files at domain root — should be in a bounded context').toEqual([]);
});
