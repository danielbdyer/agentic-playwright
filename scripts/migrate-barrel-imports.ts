/**
 * Automated consumer migration: rewrite barrel imports to direct primitive imports.
 *
 * Usage: npx tsx scripts/migrate-barrel-imports.ts [--dry-run]
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

// ─── Step 1: Build type→source mapping ───

interface ExportInfo {
  name: string;
  source: string; // relative to lib/domain/, e.g. 'governance/workflow-types'
}

const LEAF_SOURCES = [
  'governance/workflow-types',
  'confidence/levels',
  'provenance/source-brand',
  'intent/types', 'intent/routes',
  'knowledge/types', 'knowledge/semantic-dictionary-types', 'knowledge/contradiction-types',
  'knowledge/affordance', 'knowledge/widget-types', 'knowledge/route-knowledge-types',
  'resolution/types', 'resolution/model',
  'attention/pipeline-config',
  'interpretation/agent-interpreter',
  'execution/types',
  'projection/types',
  'handshake/intervention', 'handshake/session', 'handshake/workbench',
  'observation/dashboard',
  'target/interface-graph',
  'improvement/types', 'improvement/experiment',
  'learning/types',
  'fitness/types', 'fitness/architecture-fitness',
  'convergence/types',
  'drift/types',
  'evidence/types',
];

function extractExports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const names: string[] = [];

  // Match: export interface X, export type X =, export function X, export const X, export enum X
  const declRe = /export\s+(?:interface|type|function|const|enum)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(content)) !== null) {
    names.push(m[1]);
  }

  // Match: export type { X, Y, Z } from '...' (re-exports - only if from another file)
  // We want to capture re-exports too
  const reExportRe = /export\s+(?:type\s+)?\{\s*([^}]+)\}\s+from/g;
  while ((m = reExportRe.exec(content)) !== null) {
    const inner = m[1];
    for (const part of inner.split(',')) {
      const trimmed = part.trim();
      // Handle "X as Y" - use the exported name (Y)
      const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
      if (asMatch) {
        names.push(asMatch[2]);
      } else if (trimmed && /^\w+$/.test(trimmed)) {
        names.push(trimmed);
      }
    }
  }

  return [...new Set(names)];
}

function buildTypeMap(): Map<string, string> {
  const map = new Map<string, string>();

  for (const source of LEAF_SOURCES) {
    const filePath = path.join(ROOT, 'lib/domain', source + '.ts');
    if (!fs.existsSync(filePath)) {
      console.error(`Missing: ${filePath}`);
      continue;
    }
    const exports = extractExports(filePath);
    for (const name of exports) {
      // First definition wins (avoids re-export overrides)
      if (!map.has(name)) {
        map.set(name, source);
      }
    }
  }

  return map;
}

// ─── Step 2: Parse and rewrite imports ───

interface ImportStatement {
  fullMatch: string;
  names: string[];
  isTypeOnly: boolean;
  fromPath: string;
}

function parseImports(content: string, filePath: string): ImportStatement[] {
  const results: ImportStatement[] = [];
  // Match ALL forms of domain types barrel and context barrel imports:
  // - 'domain/types' (main barrel)
  // - 'domain/types/shared-context' etc. (context barrels)
  // - '../types' (within domain/X/)
  // - '../../types' (within domain/X/Y/)
  // - './types' (within domain/ root)
  const re = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+'([^']*(?:domain\/types(?:\/[^']*)?|\.\.\/\.\.\/types|\.\.\/types|\.\/types))'\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const isTypeOnly = !!m[1];
    const namesStr = m[2];
    const names = namesStr.split(',').map(n => {
      const trimmed = n.trim();
      // Handle "type X" prefix in non-type-only imports
      return trimmed.replace(/^type\s+/, '');
    }).filter(n => n.length > 0);
    results.push({
      fullMatch: m[0],
      names,
      isTypeOnly,
      fromPath: m[3],
    });
  }
  return results;
}

function computeRelativePath(fromFile: string, toSource: string): string {
  const fromDir = path.dirname(fromFile);
  const toFile = path.join(ROOT, 'lib/domain', toSource);
  let rel = path.relative(fromDir, toFile).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  // Remove .ts extension
  return rel.replace(/\.ts$/, '');
}

function rewriteFile(filePath: string, typeMap: Map<string, string>, dryRun: boolean): { changed: boolean; rewrites: number } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = parseImports(content, filePath);

  if (imports.length === 0) return { changed: false, rewrites: 0 };

  let newContent = content;
  let rewrites = 0;

  for (const imp of imports) {
    // Group names by source
    const bySource = new Map<string, string[]>();
    const unmapped: string[] = [];

    for (const name of imp.names) {
      const source = typeMap.get(name);
      if (source) {
        const existing = bySource.get(source) ?? [];
        existing.push(name);
        bySource.set(source, existing);
      } else {
        unmapped.push(name);
      }
    }

    if (unmapped.length > 0) {
      console.warn(`  UNMAPPED in ${path.relative(ROOT, filePath)}: ${unmapped.join(', ')}`);
      // Keep unmapped names in the original barrel import
    }

    // Build replacement import statements
    const lines: string[] = [];
    const importKeyword = imp.isTypeOnly ? 'import type' : 'import';

    for (const [source, names] of [...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const relPath = computeRelativePath(filePath, source);
      const sortedNames = names.sort();
      if (sortedNames.length <= 3) {
        lines.push(`${importKeyword} { ${sortedNames.join(', ')} } from '${relPath}';`);
      } else {
        const inner = sortedNames.map(n => `  ${n},`).join('\n');
        lines.push(`${importKeyword} {\n${inner}\n} from '${relPath}';`);
      }
    }

    // Keep barrel import for unmapped names
    if (unmapped.length > 0) {
      lines.push(`${importKeyword} { ${unmapped.join(', ')} } from '${imp.fromPath}';`);
    }

    const replacement = lines.join('\n');
    newContent = newContent.replace(imp.fullMatch, replacement);
    rewrites++;
  }

  if (newContent !== content) {
    if (!dryRun) {
      fs.writeFileSync(filePath, newContent);
    }
    return { changed: true, rewrites };
  }

  return { changed: false, rewrites: 0 };
}

// ─── Step 3: Find all consumer files and rewrite ───

function findConsumerFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  }

  walk(path.join(ROOT, 'lib'));
  walk(path.join(ROOT, 'tests'));
  walk(path.join(ROOT, 'scripts'));
  walk(path.join(ROOT, 'bin'));

  return files;
}

// ─── Main ───

const dryRun = process.argv.includes('--dry-run');
console.log(dryRun ? '=== DRY RUN ===' : '=== LIVE RUN ===');

console.log('Building type→source mapping...');
const typeMap = buildTypeMap();
console.log(`Mapped ${typeMap.size} exported names\n`);

console.log('Finding consumer files...');
const consumers = findConsumerFiles();
console.log(`Found ${consumers.length} TypeScript files\n`);

let totalChanged = 0;
let totalRewrites = 0;

for (const file of consumers) {
  const { changed, rewrites } = rewriteFile(file, typeMap, dryRun);
  if (changed) {
    totalChanged++;
    totalRewrites += rewrites;
    console.log(`  Rewrote ${rewrites} import(s) in ${path.relative(ROOT, file)}`);
  }
}

console.log(`\nDone. ${totalChanged} files changed, ${totalRewrites} imports rewritten.`);
if (dryRun) console.log('(dry run — no files written)');
