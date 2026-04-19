/**
 * Knowledge contribution adapter — writes hints and locator aliases
 * to screen hints YAML files.
 *
 * Uses the same YAML serialization as the proposal activation pipeline
 * (proposal-patches.ts). Validates via domain's validateScreenHints.
 *
 * This is an infrastructure adapter: it owns filesystem I/O.
 * The domain types (ScreenHints, ScreenElementHint) stay pure.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseProposalArtifact, serializeProposalArtifact } from '../../application/knowledge/proposal-patches';
import type { HintContribution, LocatorAliasContribution } from '../../../dashboard/mcp/dashboard-mcp-server';

/** Read a screen's hints.yaml file, returning a mutable record. Returns empty hints if not found. */
function readHintsFile(suiteRoot: string, screen: string): Record<string, unknown> {
  const hintsPath = path.join(suiteRoot, 'knowledge', 'screens', `${screen}.hints.yaml`);
  try {
    const raw = fs.readFileSync(hintsPath, 'utf-8');
    return parseProposalArtifact(raw, hintsPath);
  } catch {
    return { screen, screenAliases: [], elements: {} };
  }
}

/** Write a screen's hints.yaml file atomically (temp + rename). Returns the written path. */
function writeHintsFile(suiteRoot: string, screen: string, data: Record<string, unknown>): string {
  const hintsPath = path.join(suiteRoot, 'knowledge', 'screens', `${screen}.hints.yaml`);
  const dir = path.dirname(hintsPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = serializeProposalArtifact(hintsPath, data);
  const tmpPath = hintsPath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, hintsPath);
  return hintsPath;
}

/** Ensure the elements map exists and return the element entry (creating if absent). */
function ensureElement(hints: Record<string, unknown>, elementId: string): Record<string, unknown> {
  const elements = (hints.elements ?? {}) as Record<string, Record<string, unknown>>;
  const element = elements[elementId] ?? {};
  elements[elementId] = element;
  hints.elements = elements;
  return element;
}

/**
 * Create a hints writer bound to a suite root directory.
 *
 * Returns the two callback functions expected by DashboardMcpServerOptions:
 *   - writeHint: add/update a hint for a screen element
 *   - writeLocatorAlias: add a locator alias for a screen element
 */
export function createHintsWriter(suiteRoot: string) {
  const writeHint = (params: HintContribution): string | null => {
    try {
      const hints = readHintsFile(suiteRoot, params.screen);
      const element = ensureElement(hints, params.element);
      element.hint = params.hint;
      if (params.confidence !== undefined) {
        element.hintConfidence = params.confidence;
      }
      return writeHintsFile(suiteRoot, params.screen, hints);
    } catch (err) {
      process.stderr.write(`[hints-writer] Failed to write hint: ${err}\n`);
      return null;
    }
  };

  const writeLocatorAlias = (params: LocatorAliasContribution): string | null => {
    try {
      const hints = readHintsFile(suiteRoot, params.screen);
      const element = ensureElement(hints, params.element);
      const aliases = (element.aliases ?? []) as string[];
      if (!aliases.includes(params.alias)) {
        aliases.push(params.alias);
      }
      element.aliases = aliases;
      if (params.source) {
        // Track provenance of contributed aliases
        const acquired = (element.acquired ?? {}) as Record<string, unknown>;
        acquired.lastContributedBy = params.source;
        acquired.lastContributedAt = new Date().toISOString();
        element.acquired = acquired;
      }
      return writeHintsFile(suiteRoot, params.screen, hints);
    } catch (err) {
      process.stderr.write(`[hints-writer] Failed to write locator alias: ${err}\n`);
      return null;
    }
  };

  return { writeHint, writeLocatorAlias };
}
