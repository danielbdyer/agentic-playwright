/**
 * Measurement isolation laws.
 *
 * Enforces the one-way dependency between the pipeline runtime and the
 * L4 measurement subsystem:
 *
 *   measurement -> runtime  ALLOWED  (visitors read receipt types)
 *   runtime     -> measurement  FORBIDDEN  (runtime never measures itself)
 *
 * The L4 visitor architecture (commit F) makes pipeline observability
 * a downstream concern: receipts are emitted by the runtime, then a
 * separate measurement subsystem walks them. Letting the runtime
 * import from measurement would re-introduce the very coupling the
 * visitor pattern was designed to break — pipeline code would start
 * sprinkling counter increments and metric emissions inline, defeating
 * the doctrinal split established in commit B.
 *
 * These laws are doctrinal guardrails. They MUST stay green; a
 * regression here is a strong signal that an architectural mistake
 * is being made and should be reverted, not whitelisted.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const LIB_ROOT = path.resolve(__dirname, '../..', 'lib');

function walkTs(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function extractImports(content: string): readonly string[] {
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]!);
  }
  return imports;
}

/** True when an import path resolves into the L4 measurement namespace
 *  (either the domain visitor catalogue or the application orchestration
 *  layer). Walks both relative and absolute import strings. */
function importsMeasurement(importPath: string, fromFile: string): boolean {
  // Absolute paths through the project layout
  if (importPath.includes('lib/domain/fitness/metric/')) return true;
  if (importPath.includes('lib/application/measurement/')) return true;

  // Relative paths — resolve against the importing file
  if (importPath.startsWith('.')) {
    const resolved = path.resolve(path.dirname(fromFile), importPath);
    const rel = path.relative(LIB_ROOT, resolved);
    if (rel.startsWith(path.join('domain', 'fitness', 'metric'))) return true;
    if (rel.startsWith(path.join('application', 'measurement'))) return true;
  }

  return false;
}

// ─── Law: lib/runtime never imports from L4 measurement ─────────

test('lib/runtime/ does not import from L4 measurement (domain or application)', () => {
  const runtimeDir = path.join(LIB_ROOT, 'runtime');
  const runtimeFiles = walkTs(runtimeDir);
  const violations: string[] = [];

  for (const file of runtimeFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    for (const imp of imports) {
      if (importsMeasurement(imp, file)) {
        violations.push(`${path.relative(LIB_ROOT, file)}: imports measurement via "${imp}"`);
      }
    }
  }

  expect(violations).toEqual([]);
});

// ─── Law: lib/application/runtime-support never imports measurement ─

test('lib/application/runtime-support/ does not import from L4 measurement', () => {
  const supportDir = path.join(LIB_ROOT, 'application', 'runtime-support');
  const supportFiles = walkTs(supportDir);
  const violations: string[] = [];

  for (const file of supportFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    for (const imp of imports) {
      if (importsMeasurement(imp, file)) {
        violations.push(`${path.relative(LIB_ROOT, file)}: imports measurement via "${imp}"`);
      }
    }
  }

  expect(violations).toEqual([]);
});

// ─── Law: measurement domain layer is dependency-pure ───────────

test('lib/domain/fitness/metric/ does not import from application or runtime', () => {
  const metricDir = path.join(LIB_ROOT, 'domain', 'fitness', 'metric');
  const metricFiles = walkTs(metricDir);
  const violations: string[] = [];

  for (const file of metricFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    for (const imp of imports) {
      // Forbidden: any import that crosses out of the domain layer.
      if (
        imp.includes('lib/application/') ||
        imp.includes('lib/runtime/') ||
        imp.includes('lib/infrastructure/') ||
        imp.includes('lib/composition/') ||
        imp.includes('lib/playwright/')
      ) {
        violations.push(`${path.relative(LIB_ROOT, file)}: forbidden import "${imp}"`);
        continue;
      }
      if (imp.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), imp);
        const rel = path.relative(LIB_ROOT, resolved);
        if (
          rel.startsWith('application') ||
          rel.startsWith('runtime') ||
          rel.startsWith('infrastructure') ||
          rel.startsWith('composition') ||
          rel.startsWith('playwright')
        ) {
          violations.push(`${path.relative(LIB_ROOT, file)}: forbidden relative import "${imp}"`);
        }
      }
    }
  }

  expect(violations).toEqual([]);
});

// ─── Law: measurement application layer never imports from runtime ─

test('lib/application/measurement/ does not import from lib/runtime/', () => {
  const measurementDir = path.join(LIB_ROOT, 'application', 'measurement');
  const measurementFiles = walkTs(measurementDir);
  const violations: string[] = [];

  for (const file of measurementFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    for (const imp of imports) {
      if (imp.includes('lib/runtime/')) {
        violations.push(`${path.relative(LIB_ROOT, file)}: imports runtime via "${imp}"`);
        continue;
      }
      if (imp.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), imp);
        const rel = path.relative(LIB_ROOT, resolved);
        if (rel.startsWith('runtime')) {
          violations.push(`${path.relative(LIB_ROOT, file)}: imports runtime via "${imp}"`);
        }
      }
    }
  }

  expect(violations).toEqual([]);
});
