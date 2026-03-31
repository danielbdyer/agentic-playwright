/**
 * Semantic Translation Dictionary — domain types.
 *
 * Instead of aliasing as the first-rung resolution strategy, the semantic
 * dictionary accumulates LLM interpretation decisions (from translation,
 * DOM exploration, and agent interpretation) indexed by normalised intent
 * text.  Lookup uses token-level Jaccard similarity so semantically
 * equivalent phrasings ("Click search button" ≈ "Press the search btn")
 * resolve without an explicit alias and without a fresh LLM call.
 *
 * Each entry tracks confidence that grows with successful reuse and decays
 * with failures.  High-confidence entries can be promoted to approved
 * knowledge, making the alias system the *output* of the learning loop
 * rather than the *input*.
 */

import type { ElementId, PostureId, ScreenId, SnapshotTemplateId } from '../identity';
import type { StepAction, StepWinningSource } from './workflow';

// ─── Dictionary Entry ───

export interface SemanticDictionaryTarget {
  readonly action: StepAction;
  readonly screen: ScreenId;
  readonly element: ElementId | null;
  readonly posture: PostureId | null;
  readonly snapshotTemplate: SnapshotTemplateId | null;
}

/**
 * Confidence provenance tracks *how* the entry was born and reinforced.
 * - `translation`: LLM structured translation selected this target.
 * - `dom-exploration`: Live DOM exploration resolved to this target.
 * - `agent-interpreted`: Agent interpreter chose this target.
 */
export type SemanticDictionaryProvenance = 'translation' | 'dom-exploration' | 'agent-interpreted';

export interface SemanticDictionaryEntry {
  readonly id: string;
  readonly version: 1;

  /** Normalised intent text that was resolved.  Used as the semantic key. */
  readonly normalizedIntent: string;

  /** Resolved target (action + screen + element + posture + snapshot). */
  readonly target: SemanticDictionaryTarget;

  /** How the original resolution was produced. */
  readonly provenance: SemanticDictionaryProvenance;

  /** Original winning source rung that produced this entry. */
  readonly winningSource: StepWinningSource;

  // ─── Confidence ───

  /** Current confidence score in [0, 1]. */
  readonly confidence: number;

  /** How many times this entry was successfully reused. */
  readonly successCount: number;

  /** How many times a reuse led to a failure. */
  readonly failureCount: number;

  // ─── Lineage ───

  readonly createdAt: string;
  readonly lastUsedAt: string;
  readonly taskFingerprints: readonly string[];
  readonly knowledgeFingerprint: string;

  /**
   * Whether this entry has been promoted to approved knowledge.
   * Once promoted, the entry is retained for lookup but no longer
   * generates promotion proposals.
   */
  readonly promoted: boolean;
}

// ─── Catalog ───

export interface SemanticDictionaryCatalog {
  readonly kind: 'semantic-dictionary-catalog';
  readonly version: 1;
  readonly generatedAt: string;
  readonly entries: readonly SemanticDictionaryEntry[];
  readonly summary: {
    readonly totalEntries: number;
    readonly highConfidenceCount: number;
    readonly promotedCount: number;
    readonly averageConfidence: number;
  };
}

// ─── Lookup Result ───

export interface SemanticDictionaryMatch {
  readonly entry: SemanticDictionaryEntry;
  /** Token Jaccard similarity score between query and stored intent. */
  readonly similarityScore: number;
  /** Combined score: similarity × confidence. */
  readonly combinedScore: number;
}

// ─── Accrual Input ───

export interface SemanticDictionaryAccrualInput {
  readonly normalizedIntent: string;
  readonly target: SemanticDictionaryTarget;
  readonly provenance: SemanticDictionaryProvenance;
  readonly winningSource: StepWinningSource;
  readonly taskFingerprint: string;
  readonly knowledgeFingerprint: string;
}
