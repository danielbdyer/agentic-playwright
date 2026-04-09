/**
 * Generate ADO sync snapshots for synthetic scenarios and fix content hashes.
 * Reads scenarios from scenarios/synthetic/ and writes corresponding ADO snapshots.
 * Also updates the scenario YAML files with correct content hashes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { taggedContentFingerprint } from '../lib/domain/kernel/hash';

function findScenarioFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findScenarioFiles(full));
    } else if (entry.name.endsWith('.scenario.yaml')) {
      results.push(full);
    }
  }
  return results;
}

function normalizeHtmlText(input: string): string {
  return input
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeAdoContentHash(steps: Array<{ action: string; expected: string; index: number }>): string {
  const normalized = {
    parameters: [],
    steps: steps.map((step) => ({
      action: normalizeHtmlText(step.action),
      expected: normalizeHtmlText(step.expected),
      index: step.index,
      sharedStepId: null,
    })),
  };
  return taggedContentFingerprint(normalized);
}

// Simple YAML line parser for our scenario format
function parseSimpleYaml(content: string): { steps: Array<{ index: number; action_text: string; expected_text: string }> } {
  const steps: Array<{ index: number; action_text: string; expected_text: string }> = [];
  const lines = content.split('\n');
  let currentStep: Partial<{ index: number; action_text: string; expected_text: string }> = {};

  for (const line of lines) {
    const indexMatch = line.match(/^\s+- index: (\d+)/);
    if (indexMatch) {
      if (currentStep.index !== undefined) {
        steps.push(currentStep as { index: number; action_text: string; expected_text: string });
      }
      currentStep = { index: Number(indexMatch[1]) };
      continue;
    }
    const actionMatch = line.match(/^\s+action_text: "?(.+?)"?$/);
    if (actionMatch) {
      currentStep.action_text = actionMatch[1]!;
      continue;
    }
    const expectedMatch = line.match(/^\s+expected_text: "?(.+?)"?$/);
    if (expectedMatch) {
      currentStep.expected_text = expectedMatch[1]!;
    }
  }
  if (currentStep.index !== undefined) {
    steps.push(currentStep as { index: number; action_text: string; expected_text: string });
  }
  return { steps };
}

function parseAdoId(content: string): string {
  const match = content.match(/ado_id: "(\d+)"/);
  return match?.[1] ?? '';
}

function parseTitle(content: string): string {
  const match = content.match(/title: "?(.+?)"?\s*$/m);
  return match?.[1]?.replace(/"/g, '') ?? '';
}

function parseSuite(content: string): string {
  const match = content.match(/suite: (.+)$/m);
  return match?.[1]?.trim() ?? '';
}

function parseTags(content: string): string[] {
  const tags: string[] = [];
  const tagSection = content.match(/tags:\n((?:\s+- .+\n)*)/);
  if (tagSection) {
    const tagLines = tagSection[1]!.match(/- (.+)/g);
    if (tagLines) {
      for (const line of tagLines) {
        tags.push(line.replace('- ', '').trim());
      }
    }
  }
  return tags;
}

const syntheticDir = path.resolve('dogfood/scenarios/synthetic');
const adoSyncDir = path.resolve('dogfood/.ado-sync/snapshots');
const fixturesDir = path.resolve('dogfood/fixtures/ado');

fs.mkdirSync(adoSyncDir, { recursive: true });
fs.mkdirSync(fixturesDir, { recursive: true });

const files = findScenarioFiles(syntheticDir);
let count = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const adoId = parseAdoId(content);
  const title = parseTitle(content);
  const suite = parseSuite(content);
  const tags = parseTags(content);
  const parsed = parseSimpleYaml(content);

  const adoSteps = parsed.steps.map((step) => ({
    index: step.index,
    action: `<p>${step.action_text}</p>`,
    expected: `<p>${step.expected_text}</p>`,
  }));

  const contentHash = computeAdoContentHash(adoSteps);

  const adoSnapshot = {
    id: adoId,
    revision: 1,
    title,
    suitePath: suite,
    areaPath: 'synthetic',
    iterationPath: 'synthetic/sprint-1',
    tags,
    priority: 2,
    steps: adoSteps,
    parameters: [],
    dataRows: [],
    contentHash,
    syncedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(adoSyncDir, `${adoId}.json`), JSON.stringify(adoSnapshot, null, 2));
  fs.writeFileSync(path.join(fixturesDir, `${adoId}.json`), JSON.stringify(adoSnapshot, null, 2));

  // Update scenario YAML with correct content hash
  const updatedContent = content.replace(
    /content_hash: .+/,
    `content_hash: ${contentHash}`,
  );
  fs.writeFileSync(file, updatedContent);

  count += 1;
}

console.log(`Generated ${count} ADO sync snapshots with matching content hashes`);
