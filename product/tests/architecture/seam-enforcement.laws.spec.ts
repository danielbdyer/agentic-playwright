/**
 * Seam Enforcement Laws — the compile-time guard on the three-folder
 * compartmentalization (`docs/v2-direction.md §§1–2`).
 *
 * Three rules:
 *
 *   Rule 1 — No file under `workshop/` imports from `product/` except
 *            through a manifest-declared verb (or the shared
 *            append-only log directories). Until Step 2 lands the
 *            manifest, the allowlist is empty and the rule is vacuous
 *            for workshop files that don't yet reach product.
 *
 *   Rule 2 — Symmetric for `dashboard/`.
 *
 *   Rule 3 — `product/` never imports from `workshop/` or `dashboard/`.
 *            Non-vacuous from Step 0 forward.
 *
 * @see docs/v2-readiness.md §2 for the design of this test.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function walkTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      results.push(...walkTs(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

const IMPORT_REGEX = /^\s*import\s+(?:type\s+)?(?:\{[^}]*\}|[A-Za-z_$][\w$]*|\*\s+as\s+[A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/gm;
const BARE_IMPORT_REGEX = /^\s*import\s+['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT_REGEX = /import\(['"]([^'"]+)['"]\)/g;
const EXPORT_FROM_REGEX = /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;

function extractImports(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(IMPORT_REGEX)) hits.push(m[1]!);
  for (const m of source.matchAll(BARE_IMPORT_REGEX)) hits.push(m[1]!);
  for (const m of source.matchAll(DYNAMIC_IMPORT_REGEX)) hits.push(m[1]!);
  for (const m of source.matchAll(EXPORT_FROM_REGEX)) hits.push(m[1]!);
  return hits;
}

function resolveRelative(importerFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const importerDir = path.dirname(importerFile);
  const resolved = path.resolve(importerDir, spec);
  return path.relative(REPO_ROOT, resolved).replace(/\\/g, '/');
}

function importCrossesInto(
  importerFile: string,
  spec: string,
  targetFolder: 'product' | 'workshop' | 'dashboard',
): boolean {
  const rel = resolveRelative(importerFile, spec);
  if (rel === null) return false;
  return rel === targetFolder || rel.startsWith(`${targetFolder}/`);
}

function readManifestAllowlist(): readonly string[] {
  const manifestPath = path.join(REPO_ROOT, 'product', 'manifest', 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      verbs?: ReadonlyArray<{ declaredIn?: string }>;
    };
    return (manifest.verbs ?? [])
      .map((v) => v.declaredIn)
      .filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

// Paths inside `product/` that workshop/ and dashboard/ are always permitted
// to read, independent of the manifest. These are the shared append-only log
// directories named in `docs/v2-direction.md §2` (the other half of the
// seam: manifest + log set).
const ALWAYS_ALLOWED_PRODUCT_PATHS: readonly string[] = [
  'product/logs',
  'product/manifest',
];

function isManifestDeclaredOrLogPath(
  importerFile: string,
  spec: string,
  allowlist: readonly string[],
): boolean {
  const rel = resolveRelative(importerFile, spec);
  if (rel === null) return false;
  for (const allowed of ALWAYS_ALLOWED_PRODUCT_PATHS) {
    if (rel === allowed || rel.startsWith(`${allowed}/`)) return true;
  }
  for (const allowed of allowlist) {
    if (rel === allowed || rel.startsWith(`${allowed}/`)) return true;
  }
  return false;
}

describe('seam enforcement: import topology across product / workshop / dashboard', () => {
  const manifestAllowlist = readManifestAllowlist();

  test('Rule 1 — no file under workshop/ imports from product/ except through manifest or logs', () => {
    const files = walkTs(path.join(REPO_ROOT, 'workshop'));
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      for (const spec of extractImports(src)) {
        if (importCrossesInto(file, spec, 'product')) {
          if (!isManifestDeclaredOrLogPath(file, spec, manifestAllowlist)) {
            violations.push(`${path.relative(REPO_ROOT, file)}: forbidden import of "${spec}"`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('Rule 2 — no file under dashboard/ imports from product/ except through manifest or logs', () => {
    const files = walkTs(path.join(REPO_ROOT, 'dashboard'));
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      for (const spec of extractImports(src)) {
        if (importCrossesInto(file, spec, 'product')) {
          if (!isManifestDeclaredOrLogPath(file, spec, manifestAllowlist)) {
            violations.push(`${path.relative(REPO_ROOT, file)}: forbidden import of "${spec}"`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('Rule 3 — no file under product/ imports from workshop/ or dashboard/', () => {
    const files = walkTs(path.join(REPO_ROOT, 'product'));
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      for (const spec of extractImports(src)) {
        if (importCrossesInto(file, spec, 'workshop')) {
          violations.push(`${path.relative(REPO_ROOT, file)}: product/ → workshop/ ("${spec}")`);
        }
        if (importCrossesInto(file, spec, 'dashboard')) {
          violations.push(`${path.relative(REPO_ROOT, file)}: product/ → dashboard/ ("${spec}")`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
