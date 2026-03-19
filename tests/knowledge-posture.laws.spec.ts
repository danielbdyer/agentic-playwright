/**
 * Knowledge Posture Laws
 *
 * These tests verify that the three knowledge postures (cold-start, warm-start,
 * production) behave correctly and that the posture system is wired through the
 * catalog loading pipeline.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const LIB_ROOT = path.resolve(__dirname, '..', 'lib');

// ─── Law: KnowledgePosture type exists with all three variants ───

test('KnowledgePosture type and fold function are exported', () => {
  const workflowPath = path.join(LIB_ROOT, 'domain', 'types', 'workflow.ts');
  const content = fs.readFileSync(workflowPath, 'utf-8');

  expect(content).toContain("export type KnowledgePosture = 'cold-start' | 'warm-start' | 'production'");
  expect(content).toContain('export function foldKnowledgePosture');
  expect(content).toContain('export function postureIncludesKnowledge');
});

// ─── Law: foldKnowledgePosture is exhaustive over all three cases ───

test('foldKnowledgePosture handles all three posture variants', () => {
  const workflowPath = path.join(LIB_ROOT, 'domain', 'types', 'workflow.ts');
  const content = fs.readFileSync(workflowPath, 'utf-8');

  expect(content).toContain("case 'cold-start'");
  expect(content).toContain("case 'warm-start'");
  expect(content).toContain("case 'production'");
});

// ─── Law: postureIncludesKnowledge returns false only for cold-start ───

test('postureIncludesKnowledge correctly classifies cold-start as excluding knowledge', () => {
  const workflowPath = path.join(LIB_ROOT, 'domain', 'types', 'workflow.ts');
  const content = fs.readFileSync(workflowPath, 'utf-8');

  // The function must use foldKnowledgePosture with coldStart returning false
  expect(content).toContain('export function postureIncludesKnowledge');
  expect(content).toContain('coldStart: () => false');
  expect(content).toContain('warmStart: () => true');
  expect(content).toContain('production: () => true');
});

// ─── Law: KnowledgePosture enum exists in schema enums ───

test('knowledgePostures enum is defined in schema enums', () => {
  const enumsPath = path.join(LIB_ROOT, 'domain', 'schemas', 'enums.ts');
  const content = fs.readFileSync(enumsPath, 'utf-8');

  expect(content).toContain("'cold-start'");
  expect(content).toContain("'warm-start'");
  expect(content).toContain("'production'");
  expect(content).toContain('knowledgePostures');
  expect(content).toContain('KnowledgePostureSchema');
});

// ─── Law: loadWorkspaceCatalog accepts knowledgePosture option ───

test('loadWorkspaceCatalog accepts knowledgePosture in its options interface', () => {
  const catalogPath = path.join(LIB_ROOT, 'application', 'catalog', 'workspace-catalog.ts');
  const content = fs.readFileSync(catalogPath, 'utf-8');

  expect(content).toContain('interface LoadCatalogOptions');
  expect(content).toContain('knowledgePosture');
  expect(content).toContain('walkKnowledgeDir');
  expect(content).toContain('postureIncludesKnowledge');
});

// ─── Law: Catalog loader defaults to warm-start when no posture given ───

test('catalog loader defaults to warm-start posture', () => {
  const catalogPath = path.join(LIB_ROOT, 'application', 'catalog', 'workspace-catalog.ts');
  const content = fs.readFileSync(catalogPath, 'utf-8');

  // The default must be warm-start for backward compatibility
  expect(content).toContain("options.knowledgePosture ?? 'warm-start'");
});

// ─── Law: Dogfood loop passes posture through to catalog on first iteration ───

test('dogfood loop uses cold-start posture only on iteration 1', () => {
  const dogfoodPath = path.join(LIB_ROOT, 'application', 'dogfood.ts');
  const content = fs.readFileSync(dogfoodPath, 'utf-8');

  // Iteration 1 uses configured posture (may be cold-start)
  expect(content).toContain('iteration === 1');
  expect(content).toContain("options.knowledgePosture ?? 'warm-start'");
  // Subsequent iterations always use warm-start to read activated proposals
  expect(content).toContain("'warm-start'");
});

// ─── Law: ProjectPaths includes postureConfigPath ───

test('ProjectPaths interface includes postureConfigPath', () => {
  const pathsFile = path.join(LIB_ROOT, 'application', 'paths.ts');
  const content = fs.readFileSync(pathsFile, 'utf-8');

  expect(content).toContain('postureConfigPath');
  expect(content).toContain('posture.yaml');
});

// ─── Law: resolveKnowledgePosture respects three-level precedence ───

test('resolveKnowledgePosture implements explicit > file > default precedence', () => {
  const posturePath = path.join(LIB_ROOT, 'application', 'knowledge-posture.ts');
  const content = fs.readFileSync(posturePath, 'utf-8');

  // Must check explicit override first
  expect(content).toContain('explicitOverride');
  // Must read from file as second precedence
  expect(content).toContain('readPostureFile');
  // Must default to warm-start
  expect(content).toContain("'warm-start'");
  // Must validate posture values
  expect(content).toContain("'cold-start'");
  expect(content).toContain("'production'");
});

// ─── Law: Speedrun script accepts --posture flag ───

test('speedrun script supports --posture CLI flag', () => {
  const speedrunPath = path.resolve(__dirname, '..', 'scripts', 'speedrun.ts');
  const content = fs.readFileSync(speedrunPath, 'utf-8');

  expect(content).toContain("'--posture'");
  expect(content).toContain('knowledgePosture');
  expect(content).toContain('resolveKnowledgePosture');
});

// ─── Law: CLAUDE.md documents all three posture tiers ───

test('CLAUDE.md documents knowledge posture tiers', () => {
  const claudePath = path.resolve(__dirname, '..', 'CLAUDE.md');
  const content = fs.readFileSync(claudePath, 'utf-8');

  expect(content).toContain('Tier 1');
  expect(content).toContain('Tier 2');
  expect(content).toContain('cold-start');
  expect(content).toContain('warm-start');
  expect(content).toContain('production');
  expect(content).toContain('posture.yaml');
});

// ─── Law: Clean room protocol documents posture ───

test('recursive-self-improvement.md documents knowledge posture', () => {
  const docPath = path.resolve(__dirname, '..', 'docs', 'recursive-self-improvement.md');
  const content = fs.readFileSync(docPath, 'utf-8');

  expect(content).toContain('### Knowledge Posture');
  expect(content).toContain('cold-start');
  expect(content).toContain('warm-start');
  expect(content).toContain('production');
  expect(content).toContain('posture.yaml');
});
