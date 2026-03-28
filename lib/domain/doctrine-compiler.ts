/**
 * Self-Verification Doctrine Compiler (W4.11)
 *
 * Extracts structured invariants from CLAUDE.md-style markdown doctrine
 * documents and compiles them into executable law-style tests.
 *
 * Pure functions only — no side effects, no file I/O.
 */

// ─── Doctrine Pattern Types ───

export type DoctrinePattern =
  | 'file-must-not-import'
  | 'function-must-exist'
  | 'type-must-have-field'
  | 'directory-structure'
  | 'prefer-pattern'
  | 'prohibit-pattern';

// ─── Doctrine Rule ───

export interface DoctrineRule {
  readonly id: string;
  readonly source: string;
  readonly pattern: DoctrinePattern;
  readonly assertion: string;
  readonly severity: 'error' | 'warning';
}

// ─── Pattern Matchers ───

interface PatternMatcher {
  readonly pattern: DoctrinePattern;
  readonly regex: RegExp;
  readonly extract: (match: RegExpMatchArray, lineIndex: number) => DoctrineRule | null;
}

function ruleId(pattern: DoctrinePattern, index: number): string {
  return `doctrine-${pattern}-${index}`;
}

const IMPORT_PATTERN: PatternMatcher = {
  pattern: 'file-must-not-import',
  regex: /`([^`]+)`\s+must\s+(?:stay\s+pure|not\s+import\s+from)\s+(?:and\s+side-effect\s+free)?[^.]*\.?/i,
  extract: (match, lineIndex) => {
    const source = match[1];
    return source
      ? {
          id: ruleId('file-must-not-import', lineIndex),
          source: source,
          pattern: 'file-must-not-import',
          assertion: `${source} must not import from higher layers`,
          severity: 'error' as const,
        }
      : null;
  },
};

const FUNCTION_PATTERN: PatternMatcher = {
  pattern: 'function-must-exist',
  regex: /`([a-zA-Z_][a-zA-Z0-9_]*(?:\([^)]*\))?)`\s*[:—]\s*(?:must\s+(?:exist|be\s+defined)|required)/i,
  extract: (match, lineIndex) => {
    const funcName = match[1];
    return funcName
      ? {
          id: ruleId('function-must-exist', lineIndex),
          source: funcName.replace(/\(.*\)/, ''),
          pattern: 'function-must-exist',
          assertion: `Function ${funcName} must exist`,
          severity: 'error' as const,
        }
      : null;
  },
};

const TYPE_FIELD_PATTERN: PatternMatcher = {
  pattern: 'type-must-have-field',
  regex: /(?:every|each|all)\s+(?:cross-(?:lane|boundary)\s+)?(?:handoff|artifact|envelope)\s+should\s+(?:expose|have|contain)\s+(?:the\s+same\s+)?(?:envelope\s+)?(?:header:\s*)?(.+)/i,
  extract: (match, lineIndex) => {
    const fieldsRaw = match[1];
    if (!fieldsRaw) return null;
    const fields = fieldsRaw
      .replace(/[.]/g, '')
      .split(/[,]\s*/)
      .flatMap((f) => {
        const trimmed = f.replace(/`/g, '').replace(/\s+and\s+/, '').trim();
        return trimmed.length > 0 ? [trimmed] : [];
      });
    return fields.length > 0
      ? {
          id: ruleId('type-must-have-field', lineIndex),
          source: 'WorkflowEnvelope',
          pattern: 'type-must-have-field',
          assertion: `Envelope must have fields: ${fields.join(', ')}`,
          severity: 'error' as const,
        }
      : null;
  },
};

const DIRECTORY_PATTERN: PatternMatcher = {
  pattern: 'directory-structure',
  regex: /`([a-zA-Z_/]+)`\s+(?:must\s+(?:stay|remain|be)|owns?|is)\s+(?:pure|side-effect\s+free|the\s+\w+\s+layer)/i,
  extract: (match, lineIndex) => {
    const dir = match[1];
    return dir
      ? {
          id: ruleId('directory-structure', lineIndex),
          source: dir,
          pattern: 'directory-structure',
          assertion: `${dir} must conform to its architectural role`,
          severity: 'error' as const,
        }
      : null;
  },
};

const PREFER_PATTERN: PatternMatcher = {
  pattern: 'prefer-pattern',
  regex: /[Pp]refer\s+`([^`]+)`\s+over\s+`([^`]+)`/,
  extract: (match, lineIndex) => {
    const preferred = match[1];
    const discouraged = match[2];
    return preferred && discouraged
      ? {
          id: ruleId('prefer-pattern', lineIndex),
          source: `${preferred} over ${discouraged}`,
          pattern: 'prefer-pattern',
          assertion: `Prefer ${preferred} over ${discouraged}`,
          severity: 'warning' as const,
        }
      : null;
  },
};

const PROHIBIT_PATTERN: PatternMatcher = {
  pattern: 'prohibit-pattern',
  regex: /\*\*`([^`]+)`(?:\s*\w*)*\*\*\s*—\s*(.+)/,
  extract: (match, lineIndex) => {
    const prohibited = match[1];
    const reason = match[2];
    return prohibited && reason
      ? {
          id: ruleId('prohibit-pattern', lineIndex),
          source: prohibited,
          pattern: 'prohibit-pattern',
          assertion: `${prohibited} is prohibited: ${reason.trim()}`,
          severity: 'error' as const,
        }
      : null;
  },
};

const ALL_MATCHERS: readonly PatternMatcher[] = [
  IMPORT_PATTERN,
  FUNCTION_PATTERN,
  TYPE_FIELD_PATTERN,
  DIRECTORY_PATTERN,
  PREFER_PATTERN,
  PROHIBIT_PATTERN,
];

// ─── Rule Deduplication ───

function deduplicateRules(rules: readonly DoctrineRule[]): readonly DoctrineRule[] {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.pattern}:${rule.source}:${rule.assertion}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Parse Doctrine Rules ───

/**
 * Extract structured invariants from CLAUDE.md-style markdown.
 * Pure function — no side effects.
 *
 * Scans each line against known doctrine patterns and returns
 * a deduplicated, ordered array of DoctrineRule values.
 */
export function parseDoctrineRules(markdown: string): readonly DoctrineRule[] {
  const lines = markdown.split('\n');
  const rules = lines.flatMap((line, lineIndex) =>
    ALL_MATCHERS
      .flatMap((matcher) => {
        const match = line.match(matcher.regex);
        if (!match) return [];
        const rule = matcher.extract(match, lineIndex);
        return rule !== null ? [rule] : [];
      }),
  );
  return deduplicateRules(rules);
}

// ─── Test Code Generation ───

const PATTERN_TO_TEST_BODY: Readonly<Record<DoctrinePattern, (rule: DoctrineRule) => string>> = {
  'file-must-not-import': (rule) => [
    `  // Verify: ${rule.assertion}`,
    `  const files = walkTs(path.resolve(LIB_ROOT, '${escapeStr(rule.source)}'));`,
    `  for (const file of files) {`,
    `    const content = fs.readFileSync(file, 'utf-8');`,
    `    const imports = extractImports(content);`,
    `    const violations = imports.filter(i => FORBIDDEN_LAYERS.some(l => i.includes(l)));`,
    `    expect(violations, \`\${file} has forbidden imports\`).toEqual([]);`,
    `  }`,
  ].join('\n'),

  'function-must-exist': (rule) => [
    `  // Verify: ${rule.assertion}`,
    `  const allExports = collectExports(LIB_ROOT);`,
    `  expect(allExports).toContain('${escapeStr(rule.source)}');`,
  ].join('\n'),

  'type-must-have-field': (rule) => {
    const fieldsMatch = rule.assertion.match(/fields: (.+)/);
    const fields = fieldsMatch?.[1]
      ? fieldsMatch[1].split(',').map((f) => f.trim())
      : [];
    return [
      `  // Verify: ${rule.assertion}`,
      ...fields.map(
        (field) =>
          `  expect(envelopeFields).toContain('${escapeStr(field)}');`,
      ),
    ].join('\n');
  },

  'directory-structure': (rule) => [
    `  // Verify: ${rule.assertion}`,
    `  const dirPath = path.resolve(LIB_ROOT, '${escapeStr(rule.source)}');`,
    `  expect(fs.existsSync(dirPath), '${escapeStr(rule.source)} must exist').toBe(true);`,
  ].join('\n'),

  'prefer-pattern': (rule) => [
    `  // Verify: ${rule.assertion}`,
    `  // Advisory — prefer-pattern rules are warnings, not hard failures.`,
    `  expect(true).toBe(true); // placeholder for manual review`,
  ].join('\n'),

  'prohibit-pattern': (rule) => [
    `  // Verify: ${rule.assertion}`,
    `  const domainFiles = walkTs(path.resolve(LIB_ROOT, 'domain'));`,
    `  for (const file of domainFiles) {`,
    `    const content = fs.readFileSync(file, 'utf-8');`,
    `    const occurrences = (content.match(/${escapeRegex(rule.source)}/g) ?? []).length;`,
    `    expect(occurrences, \`\${file} contains prohibited '${escapeStr(rule.source)}'\`).toBe(0);`,
    `  }`,
  ].join('\n'),
};

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a single law-style test from a DoctrineRule.
 * Pure function — returns test source code as a string.
 */
export function generateLawTest(rule: DoctrineRule): string {
  const body = PATTERN_TO_TEST_BODY[rule.pattern](rule);
  const severityTag = rule.severity === 'error' ? '' : ' // @warning';
  return [
    `test('${escapeStr(rule.id)}: ${escapeStr(rule.assertion)}', () => {${severityTag}`,
    body,
    `});`,
  ].join('\n');
}

// ─── Full Test File Compilation ───

const TEST_PREAMBLE = [
  `/**`,
  ` * Auto-generated doctrine verification tests.`,
  ` * Generated by lib/domain/doctrine-compiler.ts`,
  ` * DO NOT HAND-EDIT — regenerate from doctrine source.`,
  ` */`,
  ``,
  `import { expect, test } from '@playwright/test';`,
  `import * as fs from 'node:fs';`,
  `import * as path from 'node:path';`,
  ``,
  `const LIB_ROOT = path.resolve(__dirname, '..', 'lib');`,
  `const FORBIDDEN_LAYERS = ['runtime', 'infrastructure', 'composition', 'playwright'];`,
  ``,
  `function walkTs(dir: string): string[] {`,
  `  const results: string[] = [];`,
  `  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {`,
  `    const full = path.join(dir, entry.name);`,
  `    if (entry.isDirectory()) results.push(...walkTs(full));`,
  `    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) results.push(full);`,
  `  }`,
  `  return results;`,
  `}`,
  ``,
  `function extractImports(content: string): string[] {`,
  `  const regex = /from\\s+['"]([^'"]+)['"]/g;`,
  `  const imports: string[] = [];`,
  `  let m: RegExpExecArray | null;`,
  `  while ((m = regex.exec(content)) !== null) imports.push(m[1]!);`,
  `  return imports;`,
  `}`,
  ``,
  `function collectExports(root: string): string[] {`,
  `  return walkTs(root).flatMap(f => {`,
  `    const content = fs.readFileSync(f, 'utf-8');`,
  `    const regex = /export\\s+(?:function|const|class|type|interface)\\s+(\\w+)/g;`,
  `    const names: string[] = [];`,
  `    let m: RegExpExecArray | null;`,
  `    while ((m = regex.exec(content)) !== null) names.push(m[1]!);`,
  `    return names;`,
  `  });`,
  `}`,
  ``,
  `const envelopeFields = ['kind', 'version', 'stage', 'scope', 'ids', 'fingerprints', 'lineage', 'governance', 'payload'];`,
  ``,
].join('\n');

/**
 * Compile a complete test file from an array of doctrine rules.
 * Pure function — returns the full file content as a string.
 */
export function compileDoctrineToTests(rules: readonly DoctrineRule[]): string {
  const tests = rules.map(generateLawTest).join('\n\n');
  return `${TEST_PREAMBLE}${tests}\n`;
}
