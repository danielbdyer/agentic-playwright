/**
 * Artifact Loader — reads .tesseract/ artifacts from disk.
 *
 * This is the only module in the extension that touches the filesystem.
 * All other modules operate on the loaded domain types. When artifacts
 * change on disk, the file watcher triggers a reload and downstream
 * bridges re-derive their VSCode projections.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { OperatorInboxItem } from '../../lib/domain/types/resolution';
import type { ProposalBundle } from '../../lib/domain/types/execution';

export interface ArtifactSnapshot {
  readonly inbox: readonly OperatorInboxItem[];
  readonly proposals: readonly ProposalBundle[];
}

const EMPTY_SNAPSHOT: ArtifactSnapshot = { inbox: [], proposals: [] };

function tryReadJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function collectJsonFiles(dir: string, suffix: string): readonly string[] {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(suffix))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Load all inbox items from .tesseract/inbox/index.json.
 * Falls back to empty array if the file doesn't exist.
 */
function loadInbox(rootDir: string): readonly OperatorInboxItem[] {
  const indexPath = path.join(rootDir, '.tesseract', 'inbox', 'index.json');
  const data = tryReadJson<{ readonly items: readonly OperatorInboxItem[] }>(indexPath);
  return data?.items ?? [];
}

/**
 * Load all proposal bundles from generated/{suite}/*.proposals.json.
 * Walks the generated directory for any proposals files.
 */
function loadProposals(rootDir: string): readonly ProposalBundle[] {
  const generatedDir = path.join(rootDir, 'generated');
  if (!fs.existsSync(generatedDir)) return [];

  const bundles: ProposalBundle[] = [];

  // Walk one level of suite directories
  try {
    const suiteDirs = fs.readdirSync(generatedDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(generatedDir, d.name));

    for (const suiteDir of suiteDirs) {
      const proposalFiles = collectJsonFiles(suiteDir, '.proposals.json');
      for (const file of proposalFiles) {
        const bundle = tryReadJson<ProposalBundle>(file);
        if (bundle) bundles.push(bundle);
      }
    }
  } catch {
    // generated/ may not exist yet
  }

  return bundles;
}

/**
 * Load a complete artifact snapshot from disk.
 * Safe to call at any time — returns empty snapshot on any failure.
 */
export function loadArtifacts(rootDir: string): ArtifactSnapshot {
  try {
    return {
      inbox: loadInbox(rootDir),
      proposals: loadProposals(rootDir),
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}
