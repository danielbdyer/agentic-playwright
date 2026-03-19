/**
 * Knowledge Posture Resolution
 *
 * Resolves the active KnowledgePosture for a suite by checking:
 *   1. Explicit override (CLI flag, programmatic option)
 *   2. Suite-level config file ({suiteRoot}/posture.yaml)
 *   3. Default: 'warm-start'
 *
 * The posture.yaml file is a single-field YAML document:
 *
 *   posture: cold-start
 *
 * This makes the posture "set and forget" — place the file in the suite root
 * and every tool that loads the catalog will respect it automatically.
 */

import * as fs from 'node:fs';
import type { KnowledgePosture } from '../domain/types';

const VALID_POSTURES: ReadonlySet<string> = new Set(['cold-start', 'warm-start', 'production']);

/**
 * Read the posture from a posture.yaml file, if it exists.
 * Returns null if the file doesn't exist or is unparseable.
 */
function readPostureFile(postureConfigPath: string): KnowledgePosture | null {
  try {
    const raw = fs.readFileSync(postureConfigPath, 'utf-8');
    // Simple YAML parse for a single "posture: value" field.
    // Avoids a full YAML parser dependency for a one-field config.
    const match = raw.match(/^\s*posture\s*:\s*(\S+)/m);
    const value = match?.[1]?.replace(/['",]/g, '').trim();
    return value && VALID_POSTURES.has(value) ? (value as KnowledgePosture) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the active knowledge posture for a suite.
 *
 * Precedence:
 *   1. Explicit override (from CLI flag or programmatic option)
 *   2. posture.yaml at suite root
 *   3. 'warm-start' (backward compatible default)
 */
export function resolveKnowledgePosture(
  postureConfigPath: string,
  explicitOverride?: KnowledgePosture | undefined,
): KnowledgePosture {
  return explicitOverride
    ?? readPostureFile(postureConfigPath)
    ?? 'warm-start';
}
