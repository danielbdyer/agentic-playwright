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
import type { ShingleIndex } from '../shingles';

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

  /** Consecutive failures without an intervening success. Reset to 0 on success. */
  readonly consecutiveFailures: number;

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
  /**
   * In-memory shingle index for TF-IDF similarity lookup.
   * Not serialized to JSON (Maps don't round-trip). Rebuilt on catalog load
   * via `ensureShingleIndex()`. Undefined until first lookup or explicit build.
   */
  readonly shingleIndex?: ShingleIndex | undefined;
}

// ─── Retrieval Context ───

/**
 * Structural context supplied to the lookup function so it can score
 * not just textual similarity but also structural compatibility:
 * - Does the entry's action match the allowed actions?
 * - Is the entry's screen the current or a reachable screen?
 * - Does the entry's posture match a feasible posture?
 * - Does the entry's route overlap with active route variants?
 *
 * This moves the system from "text similarity only" to
 * "text similarity + structural plausibility + governance state".
 */
export interface SemanticRetrievalContext {
  /** Allowed actions for the current step. */
  readonly allowedActions: readonly StepAction[];
  /** Current screen from the observed state session (if any). */
  readonly currentScreen: ScreenId | null;
  /** Screens available in the resolution context. */
  readonly availableScreens: readonly ScreenId[];
  /** Active route variant refs from memory. */
  readonly activeRouteVariantRefs: readonly string[];
  /** Governance filter: which governance states are auto-applicable. */
  readonly governanceFilter: 'approved-only' | 'include-review' | 'all';
}

// ─── Lookup Result ───

export interface SemanticDictionaryMatchScoring {
  /** Token Jaccard similarity between query and stored intent. */
  readonly textSimilarity: number;
  /** Structural compatibility score [0, 1]. */
  readonly structuralScore: number;
  /** Entry confidence [0, 1]. */
  readonly confidence: number;
  /** Final combined score: weighted blend of all dimensions. */
  readonly combined: number;
}

export interface SemanticDictionaryMatch {
  readonly entry: SemanticDictionaryEntry;
  /** Token Jaccard similarity score between query and stored intent. */
  readonly similarityScore: number;
  /** Combined score: similarity × confidence (backwards compat). */
  readonly combinedScore: number;
  /** Full scoring breakdown (when retrieval context is provided). */
  readonly scoring?: SemanticDictionaryMatchScoring | undefined;
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
