/**
 * Doctrine Compiler -- Law Tests (W4.11)
 *
 * Verifies the self-verification doctrine compiler that extracts
 * structured invariants from CLAUDE.md-style markdown and compiles
 * them into executable law-style tests.
 *
 * Laws:
 *   1.  parseDoctrineRules returns readonly array
 *   2.  Empty input produces empty rules
 *   3.  'must stay pure' lines produce file-must-not-import rules
 *   4.  'Prefer X over Y' lines produce prefer-pattern rules
 *   5.  Prohibited pattern lines produce prohibit-pattern rules
 *   6.  Envelope header lines produce type-must-have-field rules
 *   7.  generateLawTest produces valid test(...) block
 *   8.  compileDoctrineToTests includes preamble
 *   9.  Round-trip: parse → compile → contains all rule IDs
 *  10.  Rule IDs are unique within a parsed set
 *  11.  Severity is 'error' or 'warning' only
 *  12.  All patterns produce non-empty assertions
 *  13.  Deterministic: same input → same output
 *  14.  Deduplication: repeated lines produce single rule
 *  15.  Generated test file is syntactically balanced (braces)
 *
 * 150 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import {
  parseDoctrineRules,
  generateLawTest,
  compileDoctrineToTests,
  type DoctrineRule,
  type DoctrinePattern,
} from '../lib/domain/doctrine-compiler';
import { mulberry32, pick, randomInt, randomWord } from './support/random';

// ─── Constants ───

const ALL_PATTERNS: readonly DoctrinePattern[] = [
  'file-must-not-import',
  'function-must-exist',
  'type-must-have-field',
  'directory-structure',
  'prefer-pattern',
  'prohibit-pattern',
];

const ALL_SEVERITIES: readonly ('error' | 'warning')[] = ['error', 'warning'];

// ─── Helpers ───

function randomDoctrineRule(next: () => number, index: number): DoctrineRule {
  const pattern = pick(next, ALL_PATTERNS);
  return {
    id: `doctrine-${pattern}-${index}`,
    source: `lib/${randomWord(next)}`,
    pattern,
    assertion: `${randomWord(next)} must ${randomWord(next)}`,
    severity: pick(next, ALL_SEVERITIES),
  };
}

/** Generate a random markdown line that should match a known pattern. */
function randomDoctrineMarkdownLine(next: () => number): string {
  const variant = randomInt(next, 6);
  switch (variant) {
    case 0:
      return `\`lib/${randomWord(next)}\` must stay pure and side-effect free.`;
    case 1:
      return `\`lib/${randomWord(next)}\` must not import from higher layers.`;
    case 2:
      return `Prefer \`${randomWord(next)}\` over \`${randomWord(next)}\``;
    case 3:
      return `**\`${randomWord(next)}\`** — use \`${randomWord(next)}\` instead`;
    case 4:
      return `Every cross-lane handoff should expose the same envelope header: \`kind\`, \`version\`, \`stage\`, \`scope\`.`;
    case 5:
      return `\`lib/${randomWord(next)}\` owns the ${randomWord(next)} layer.`;
    default:
      return `Some unrelated line about ${randomWord(next)}.`;
  }
}

/** Generate a random markdown document with a mix of doctrine and prose. */
function randomDoctrineMarkdown(next: () => number): string {
  const lineCount = 5 + randomInt(next, 20);
  return Array.from({ length: lineCount }, () => {
    const isDoctrine = next() > 0.4;
    return isDoctrine
      ? randomDoctrineMarkdownLine(next)
      : `Regular prose about ${randomWord(next)}.`;
  }).join('\n');
}

// ─── Known fixture fragments ───

const IMPORT_FRAGMENT = '`lib/domain` must stay pure and side-effect free.';
const PREFER_FRAGMENT = 'Prefer `const` over `let`';
const PROHIBIT_FRAGMENT = '**`Array.push()`** — use spread instead';
const ENVELOPE_FRAGMENT =
  'Every cross-lane handoff should expose the same envelope header: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, and `payload`.';
const DIRECTORY_FRAGMENT = '`lib/domain` must stay pure and side-effect free.';

// ─── Law 1: parseDoctrineRules returns readonly array (150 seeds) ───

test('parseDoctrineRules returns array (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const markdown = randomDoctrineMarkdown(next);
    const rules = parseDoctrineRules(markdown);
    expect(Array.isArray(rules)).toBe(true);
  }
});

// ─── Law 2: Empty input produces empty rules (150 seeds) ───

test('empty input produces empty rules (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const rules = parseDoctrineRules('');
    expect(rules.length).toBe(0);
  }
});

// ─── Law 3: 'must stay pure' lines produce file-must-not-import rules (150 seeds) ───

test('must stay pure lines produce file-must-not-import rules (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const dirName = randomWord(next);
    const markdown = `\`lib/${dirName}\` must stay pure and side-effect free.`;
    const rules = parseDoctrineRules(markdown);
    const importRules = rules.filter((r) => r.pattern === 'file-must-not-import');
    expect(importRules.length).toBeGreaterThanOrEqual(1);
    expect(importRules[0]?.source).toBe(`lib/${dirName}`);
  }
});

// ─── Law 4: 'Prefer X over Y' lines produce prefer-pattern rules (150 seeds) ───

test('Prefer X over Y lines produce prefer-pattern rules (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const preferred = randomWord(next);
    const discouraged = randomWord(next);
    const markdown = `Prefer \`${preferred}\` over \`${discouraged}\``;
    const rules = parseDoctrineRules(markdown);
    const preferRules = rules.filter((r) => r.pattern === 'prefer-pattern');
    expect(preferRules.length).toBeGreaterThanOrEqual(1);
    expect(preferRules[0]?.source).toContain(preferred);
    expect(preferRules[0]?.source).toContain(discouraged);
  }
});

// ─── Law 5: Prohibited pattern lines produce prohibit-pattern rules (150 seeds) ───

test('prohibited pattern lines produce prohibit-pattern rules (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const prohibited = randomWord(next);
    const reason = `use ${randomWord(next)} instead`;
    const markdown = `**\`${prohibited}\`** — ${reason}`;
    const rules = parseDoctrineRules(markdown);
    const prohibitRules = rules.filter((r) => r.pattern === 'prohibit-pattern');
    expect(prohibitRules.length).toBeGreaterThanOrEqual(1);
    expect(prohibitRules[0]?.source).toBe(prohibited);
  }
});

// ─── Law 6: Envelope header lines produce type-must-have-field rules (150 seeds) ───

test('envelope header lines produce type-must-have-field rules (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const rules = parseDoctrineRules(ENVELOPE_FRAGMENT);
    const fieldRules = rules.filter((r) => r.pattern === 'type-must-have-field');
    expect(fieldRules.length).toBeGreaterThanOrEqual(1);
    expect(fieldRules[0]?.assertion).toContain('kind');
    expect(fieldRules[0]?.assertion).toContain('version');
  }
});

// ─── Law 7: generateLawTest produces valid test(...) block (150 seeds) ───

test('generateLawTest produces valid test block (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const rule = randomDoctrineRule(next, seed);
    const testCode = generateLawTest(rule);
    expect(testCode).toContain('test(');
    expect(testCode).toContain(rule.id);
    expect(testCode).toContain('});');
  }
});

// ─── Law 8: compileDoctrineToTests includes preamble (150 seeds) ───

test('compileDoctrineToTests includes preamble (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const ruleCount = randomInt(next, 5);
    const rules = Array.from({ length: ruleCount }, (_, i) =>
      randomDoctrineRule(next, i),
    );
    const output = compileDoctrineToTests(rules);
    expect(output).toContain("import { expect, test } from '@playwright/test'");
    expect(output).toContain('DO NOT HAND-EDIT');
    expect(output).toContain('doctrine-compiler.ts');
  }
});

// ─── Law 9: Round-trip: parse → compile → contains all rule IDs (150 seeds) ───

test('round-trip: parse then compile contains all rule IDs (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const markdown = randomDoctrineMarkdown(next);
    const rules = parseDoctrineRules(markdown);
    if (rules.length === 0) continue;

    const output = compileDoctrineToTests(rules);
    for (const rule of rules) {
      expect(output).toContain(rule.id);
    }
  }
});

// ─── Law 10: Rule IDs are unique within a parsed set (150 seeds) ───

test('rule IDs are unique within a parsed set (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const markdown = randomDoctrineMarkdown(next);
    const rules = parseDoctrineRules(markdown);
    const ids = rules.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  }
});

// ─── Law 11: Severity is 'error' or 'warning' only (150 seeds) ───

test('severity is error or warning only (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const markdown = randomDoctrineMarkdown(next);
    const rules = parseDoctrineRules(markdown);
    for (const rule of rules) {
      expect(['error', 'warning']).toContain(rule.severity);
    }
  }
});

// ─── Law 12: All patterns produce non-empty assertions (150 seeds) ───

test('all patterns produce non-empty assertions (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const markdown = randomDoctrineMarkdown(next);
    const rules = parseDoctrineRules(markdown);
    for (const rule of rules) {
      expect(rule.assertion.length).toBeGreaterThan(0);
    }
  }
});

// ─── Law 13: Deterministic: same input → same output (150 seeds) ───

test('deterministic: same input produces same output (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next1 = mulberry32(seed);
    const next2 = mulberry32(seed);
    const markdown1 = randomDoctrineMarkdown(next1);
    const markdown2 = randomDoctrineMarkdown(next2);
    expect(markdown1).toBe(markdown2); // same PRNG → same markdown

    const rules1 = parseDoctrineRules(markdown1);
    const rules2 = parseDoctrineRules(markdown2);
    expect(rules1).toEqual(rules2);

    if (rules1.length > 0) {
      const output1 = compileDoctrineToTests(rules1);
      const output2 = compileDoctrineToTests(rules2);
      expect(output1).toBe(output2);
    }
  }
});

// ─── Law 14: Deduplication: repeated lines produce single rule per unique key (150 seeds) ───

test('deduplication: repeated lines produce single rule per unique key (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const line = randomDoctrineMarkdownLine(next);
    const repeatCount = 2 + randomInt(next, 5);
    const markdown = Array.from({ length: repeatCount }, () => line).join('\n');
    const rules = parseDoctrineRules(markdown);

    // Each unique (pattern, source, assertion) tuple should appear at most once
    const keys = rules.map((r) => `${r.pattern}:${r.source}:${r.assertion}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  }
});

// ─── Law 15: Generated test file has balanced braces (150 seeds) ───

test('generated test file has balanced braces (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const ruleCount = 1 + randomInt(next, 6);
    const rules = Array.from({ length: ruleCount }, (_, i) =>
      randomDoctrineRule(next, i),
    );
    const output = compileDoctrineToTests(rules);

    const openBraces = (output.match(/{/g) ?? []).length;
    const closeBraces = (output.match(/}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);

    const openParens = (output.match(/\(/g) ?? []).length;
    const closeParens = (output.match(/\)/g) ?? []).length;
    expect(openParens).toBe(closeParens);
  }
});
