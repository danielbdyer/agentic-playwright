/**
 * Extension Bridge — Integration Tests
 *
 * Verifies that the extension's artifact loader and bridge modules
 * correctly map between domain types and the VSCode API surface.
 * These tests exercise the artifact-loader (filesystem → domain types)
 * and the bridge logic without requiring a real VSCode instance.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadArtifacts } from '../extension/src/artifact-loader';

// ─── Helpers ───

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tesseract-ext-test-'));
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── Law: loadArtifacts returns empty snapshot for missing .tesseract/ ───

test('loadArtifacts returns empty snapshot when .tesseract/ does not exist', () => {
  const tmpDir = createTempDir();
  const snapshot = loadArtifacts(tmpDir);

  expect(snapshot.inbox).toEqual([]);
  expect(snapshot.proposals).toEqual([]);

  fs.rmSync(tmpDir, { recursive: true });
});

// ─── Law: loadArtifacts reads inbox from index.json ───

test('loadArtifacts reads inbox items from .tesseract/inbox/index.json', () => {
  const tmpDir = createTempDir();
  const inboxItems = [
    {
      title: 'Unresolved step',
      kind: 'needs-human',
      status: 'actionable',
      adoId: '10001',
      artifactPath: '.tesseract/tasks/10001.resolution.json',
      nextCommands: ['npm run run'],
    },
    {
      title: 'Proposal ready',
      kind: 'proposal',
      status: 'actionable',
      adoId: '10002',
      proposalId: 'prop-1',
      artifactPath: 'generated/demo/10002.proposals.json',
      nextCommands: ['npm run approve -- --proposal-id=prop-1'],
    },
  ];

  writeJson(path.join(tmpDir, '.tesseract', 'inbox', 'index.json'), { items: inboxItems });

  const snapshot = loadArtifacts(tmpDir);

  expect(snapshot.inbox).toHaveLength(2);
  expect(snapshot.inbox[0]!.title).toBe('Unresolved step');
  expect(snapshot.inbox[1]!.kind).toBe('proposal');

  fs.rmSync(tmpDir, { recursive: true });
});

// ─── Law: loadArtifacts reads proposals from generated/ ───

test('loadArtifacts reads proposal bundles from generated/{suite}/*.proposals.json', () => {
  const tmpDir = createTempDir();
  const proposalBundle = {
    kind: 'proposal-bundle',
    scenarioId: '10001',
    payload: {
      proposals: [
        {
          proposalId: 'prop-1',
          title: 'Add alias for search',
          artifactType: 'hints',
          targetPath: 'knowledge/screens/policy-search.hints.yaml',
          activation: { status: 'pending' },
        },
      ],
    },
    proposals: [
      {
        proposalId: 'prop-1',
        title: 'Add alias for search',
        artifactType: 'hints',
        targetPath: 'knowledge/screens/policy-search.hints.yaml',
        activation: { status: 'pending' },
      },
    ],
  };

  writeJson(path.join(tmpDir, 'generated', 'demo', '10001.proposals.json'), proposalBundle);

  const snapshot = loadArtifacts(tmpDir);

  expect(snapshot.proposals).toHaveLength(1);

  fs.rmSync(tmpDir, { recursive: true });
});

// ─── Law: loadArtifacts tolerates malformed JSON ───

test('loadArtifacts returns empty for malformed inbox JSON', () => {
  const tmpDir = createTempDir();
  const inboxPath = path.join(tmpDir, '.tesseract', 'inbox', 'index.json');
  fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
  fs.writeFileSync(inboxPath, '{ invalid json');

  const snapshot = loadArtifacts(tmpDir);

  expect(snapshot.inbox).toEqual([]);

  fs.rmSync(tmpDir, { recursive: true });
});

// ─── Law: loadArtifacts handles empty generated/ ───

test('loadArtifacts returns empty proposals when generated/ exists but has no proposal files', () => {
  const tmpDir = createTempDir();
  fs.mkdirSync(path.join(tmpDir, 'generated', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'generated', 'demo', '10001.spec.ts'), 'export {}');

  const snapshot = loadArtifacts(tmpDir);

  expect(snapshot.proposals).toEqual([]);

  fs.rmSync(tmpDir, { recursive: true });
});
