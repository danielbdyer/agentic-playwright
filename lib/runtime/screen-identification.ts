/**
 * Runtime screen identification from DOM + interface graph.
 *
 * Inspects a DOM snapshot against the ApplicationInterfaceGraph to identify
 * which screen the user is currently viewing. Extracts structural signals
 * from the DOM (tag landmarks, ARIA roles, headings, data-testid attributes,
 * navigation elements) and matches them against graph node labels and metadata.
 *
 * All functions are pure — no side effects, no mutation.
 */

import type {
  ApplicationInterfaceGraph,
  InterfaceGraphNode,
} from '../domain/types/interface';

// ─── Types ───

export interface ScreenIdentification {
  readonly screenId: string | null;
  readonly confidence: number;
  readonly matchedSignals: readonly string[];
}

export interface ScreenCandidate {
  readonly screenId: string;
  readonly matchScore: number;
}

// ─── Signal extraction ───

/**
 * Extract identifying signals from a DOM snapshot string.
 *
 * Signals include:
 *   - ARIA landmark roles (e.g. role="navigation", role="main")
 *   - data-testid attribute values
 *   - heading text (h1–h6)
 *   - title element text
 *   - nav/header/footer/main semantic tags
 *   - form element names and ids
 *   - aria-label values
 */
export function computeScreenSignature(domSnapshot: string): readonly string[] {
  const signals: readonly string[] = [
    ...extractByPattern(domSnapshot, /role="([^"]+)"/g, 'role'),
    ...extractByPattern(domSnapshot, /data-testid="([^"]+)"/g, 'testid'),
    ...extractByPattern(domSnapshot, /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi, 'heading'),
    ...extractByPattern(domSnapshot, /<title[^>]*>([^<]+)<\/title>/gi, 'title'),
    ...extractByPattern(domSnapshot, /aria-label="([^"]+)"/g, 'aria-label'),
    ...extractSemanticTags(domSnapshot),
    ...extractByPattern(domSnapshot, /name="([^"]+)"/g, 'name'),
    ...extractByPattern(domSnapshot, /id="([^"]+)"/g, 'id'),
  ];

  // Deduplicate while preserving order
  return [...new Set(signals)];
}

function extractByPattern(
  html: string,
  pattern: RegExp,
  prefix: string,
): readonly string[] {
  const regex = new RegExp(pattern.source, pattern.flags);
  return [...html.matchAll(regex)]
    .flatMap((m) => {
      const v = (m[1] ?? '').trim();
      return v.length > 0 ? [`${prefix}:${v.toLowerCase()}`] : [];
    });
}

function extractSemanticTags(html: string): readonly string[] {
  const SEMANTIC_TAGS = ['nav', 'header', 'footer', 'main', 'aside', 'form', 'section', 'article'] as const;
  return SEMANTIC_TAGS.flatMap((tag) => {
    const pattern = new RegExp(`<${tag}[\\s>]`, 'i');
    return pattern.test(html) ? [`semantic:${tag}`] : [];
  });
}

// ─── Graph matching ───

/**
 * Match extracted DOM signals against the interface graph's screen nodes.
 *
 * For each screen node in the graph, compute a match score based on the
 * number of signals that match against the node's label, element labels,
 * and associated metadata.
 */
export function matchSignatureToGraph(
  signals: readonly string[],
  graph: ApplicationInterfaceGraph,
): readonly ScreenCandidate[] {
  const screenNodes = graph.nodes.filter((n) => n.kind === 'screen');

  if (screenNodes.length === 0 || signals.length === 0) {
    return [];
  }

  // Build a lookup of screen -> child node labels for deeper matching
  const screenChildLabels = buildScreenChildLabels(graph);

  const candidates = screenNodes.map((screenNode) => {
    const screenId = screenNode.screen ?? screenNode.id;
    const childLabels = screenChildLabels.get(screenNode.id) ?? [];
    const score = computeMatchScore(signals, screenNode, childLabels);
    return { screenId, matchScore: score };
  });

  // Return only non-zero candidates, sorted descending
  return candidates
    .filter((c) => c.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

function buildScreenChildLabels(
  graph: ApplicationInterfaceGraph,
): ReadonlyMap<string, readonly string[]> {
  // Find edges from screen nodes to their children
  const screenNodeIds = new Set(
    graph.nodes.flatMap((n) => n.kind === 'screen' ? [n.id] : []),
  );

  // Collect child node IDs for each screen via 'contains' edges
  const screenToChildIds = graph.edges
    .filter((e) => e.kind === 'contains' && screenNodeIds.has(e.from))
    .reduce<ReadonlyMap<string, readonly string[]>>(
      (acc, edge) => {
        const existing = acc.get(edge.from) ?? [];
        return new Map([...acc, [edge.from, [...existing, edge.to]]]);
      },
      new Map(),
    );

  // Map child IDs to their labels
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  return new Map(
    [...screenToChildIds.entries()].map(([screenId, childIds]) => [
      screenId,
      childIds
        .flatMap((cid) => {
          const n = nodeById.get(cid);
          return n !== undefined ? [n.label.toLowerCase()] : [];
        }),
    ]),
  );
}

function computeMatchScore(
  signals: readonly string[],
  screenNode: InterfaceGraphNode,
  childLabels: readonly string[],
): number {
  const screenLabel = screenNode.label.toLowerCase();
  const allLabels = [screenLabel, ...childLabels];

  return signals.reduce((score, signal) => {
    const signalValue = signal.includes(':') ? signal.split(':').slice(1).join(':') : signal;

    // Check if any label contains the signal value or vice versa
    const directMatch = allLabels.some(
      (label) => label.includes(signalValue) || signalValue.includes(label),
    );

    // Weighted scoring: title/heading matches are stronger
    const weight = signal.startsWith('title:') || signal.startsWith('heading:')
      ? 2.0
      : signal.startsWith('testid:') || signal.startsWith('aria-label:')
        ? 1.5
        : 1.0;

    return score + (directMatch ? weight : 0);
  }, 0);
}

// ─── Top-level identification ───

/**
 * Identify the current screen from a DOM snapshot using the interface graph.
 *
 * Returns the best candidate if its confidence exceeds threshold, or null screenId
 * if no match is strong enough.
 */
export function identifyScreenFromDOM(
  domSnapshot: string,
  graph: ApplicationInterfaceGraph,
): ScreenIdentification {
  const signals = computeScreenSignature(domSnapshot);

  if (signals.length === 0) {
    return { screenId: null, confidence: 0, matchedSignals: [] };
  }

  const candidates = matchSignatureToGraph(signals, graph);

  if (candidates.length === 0) {
    return { screenId: null, confidence: 0, matchedSignals: signals };
  }

  const best = candidates[0] as ScreenCandidate;
  const maxPossibleScore = signals.length * 2.0; // theoretical max if every signal matched at max weight
  const confidence = Math.min(best.matchScore / maxPossibleScore, 1.0);

  // Identify which signals actually contributed to the match
  const matchedSignals = signals.filter((signal) => {
    const signalValue = signal.includes(':') ? signal.split(':').slice(1).join(':') : signal;
    const screenNode = graph.nodes.find(
      (n) => n.kind === 'screen' && (n.screen ?? n.id) === best.screenId,
    );
    if (!screenNode) return false;
    const label = screenNode.label.toLowerCase();
    return label.includes(signalValue) || signalValue.includes(label);
  });

  return {
    screenId: best.screenId,
    confidence,
    matchedSignals,
  };
}
