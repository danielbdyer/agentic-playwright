import { type SeededRng, pick } from '../random';

// ─── Domain vocabulary ───
//
// These are domain-appropriate synonyms that a real QA tester in the insurance
// domain would use, but that are NOT in the knowledge model's alias pools.
// The gap between these and the known aliases is what the translation pipeline
// must learn to bridge.

const DOMAIN_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  policy: ['coverage', 'plan', 'insurance policy', 'account', 'contract', 'certificate'],
  amendment: ['endorsement', 'change request', 'modification', 'rider', 'policy change'],
  claim: ['incident', 'loss', 'reported claim', 'filed claim', 'case'],
  claims: ['incidents', 'losses', 'reported claims', 'filed claims', 'cases'],
  search: ['look up', 'find', 'query', 'locate', 'retrieve'],
  detail: ['information', 'particulars', 'overview', 'profile', 'record'],
  status: ['state', 'condition', 'current standing', 'disposition'],
  date: ['start date', 'inception date', 'commencement date', 'effective date'],
  number: ['ID', 'identifier', 'reference', 'code', 'ref'],
  table: ['listing', 'register', 'log', 'grid', 'records'],
  button: ['action', 'control', 'link'],
  review: ['approve', 'finalize', 'complete', 'submit for review'],
  navigate: ['go to', 'open', 'visit', 'access', 'load', 'pull up', 'bring up'],
  verify: ['confirm', 'check', 'make sure', 'validate', 'ensure', 'see that'],
  enter: ['type', 'input', 'key in', 'fill in', 'provide', 'supply', 'put in'],
  click: ['press', 'tap', 'hit', 'activate', 'trigger', 'select', 'use'],
  visible: ['displayed', 'shown', 'present', 'on screen', 'appearing', 'rendered'],
  error: ['warning', 'alert', 'problem', 'issue', 'failure message'],
};

// ─── Affordance vocabulary ───
//
// How QA testers describe interactions with different widget types.

const AFFORDANCE_VERBS: Readonly<Record<string, readonly string[]>> = {
  'os-input': ['type in', 'enter', 'fill in', 'key in', 'put in', 'provide', 'supply'],
  'os-textarea': ['type in', 'enter', 'write in', 'fill out', 'compose in'],
  'os-button': ['click', 'press', 'hit', 'tap', 'activate', 'use', 'trigger'],
  'os-select': ['choose', 'pick', 'select', 'set to', 'change to'],
  'os-table': ['check the', 'look at', 'review the', 'inspect the', 'examine the'],
  'os-region': ['check', 'verify', 'see that', 'confirm', 'inspect', 'look at'],
};

// ─── Natural language assertion patterns ───
//
// How QA testers describe expected outcomes — business-oriented, not element-oriented.

const ASSERTION_PATTERNS: readonly string[] = [
  '{subject} is displayed on the page',
  '{subject} shows the correct value',
  'the {subject} information is visible',
  '{subject} appears with the expected data',
  'I can see {subject} on screen',
  'the page shows {subject} correctly',
  '{subject} is present and accurate',
  'confirm {subject} is showing',
  '{subject} data is loaded',
  'the correct {subject} is displayed',
];

const NAV_PATTERNS: readonly string[] = [
  'Go to the {screen} page',
  'Open the {screen}',
  'Navigate to {screen}',
  'Pull up the {screen}',
  'Access the {screen} page',
  'Load the {screen} screen',
  'Visit the {screen}',
  'Bring up the {screen} page',
];

const NAV_EXPECTATION_PATTERNS: readonly string[] = [
  '{screen} page loads',
  '{screen} is displayed',
  'the {screen} page appears',
  '{screen} screen is visible',
  '{screen} loads successfully',
];

// ─── Core types ───

/** Describes how a held-out phrase was generated and what it's anchored to. */
export interface GapAnchor {
  readonly screenId: string;
  readonly elementId: string | null;
  readonly knownAlias: string;
  readonly gapKind: 'domain-synonym' | 'affordance-rephrase' | 'natural-language' | 'identity';
}

/** A generated phrase with its ground truth anchor. */
export interface GapPhrase {
  readonly text: string;
  readonly anchor: GapAnchor;
}

// ─── Held-out vocabulary generation ───

/**
 * Split a camelCase/kebab-case identifier into lowercase words.
 * Example: "policyNumberInput" → ["policy", "number", "input"]
 */
function splitIdentifier(id: string): readonly string[] {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1);
}

/**
 * Look up domain synonyms for a word. Returns the word itself if no synonyms found.
 */
function domainSynonymsFor(word: string): readonly string[] {
  return DOMAIN_SYNONYMS[word.toLowerCase()] ?? [word];
}

/**
 * Generate held-out phrases for an element by substituting domain synonyms
 * into the element's semantic components.
 *
 * Example: "policyNumber" → ["coverage ID", "plan reference", "account identifier"]
 *
 * These phrases are domain-appropriate but lexically distant from known aliases,
 * which is exactly what the translation pipeline must learn to bridge.
 */
export function generateHeldOutPhrases(
  elementId: string,
  widget: string,
  screenId: string,
  rng: SeededRng,
): readonly GapPhrase[] {
  const words = splitIdentifier(elementId);
  const screenWords = splitIdentifier(screenId);
  const knownAlias = words.join(' ');

  // Strategy 1: Domain synonym substitution on element words
  const synonymPhrases = words.length > 0
    ? Array.from({ length: 4 }, () => {
      const substituted = words.map((word) => {
        const synonyms = domainSynonymsFor(word);
        return synonyms.length > 1 ? pick(synonyms, rng) : word;
      });
      return {
        text: substituted.join(' '),
        anchor: { screenId, elementId, knownAlias, gapKind: 'domain-synonym' as const },
      };
    })
    : [];

  // Strategy 2: Affordance-based verb phrases
  const verbs = AFFORDANCE_VERBS[widget] ?? AFFORDANCE_VERBS['os-region']!;
  const affordancePhrases = Array.from({ length: 2 }, () => {
    const verb = pick(verbs, rng);
    const target = words.length > 0
      ? words.map((w) => (rng() > 0.5 ? pick(domainSynonymsFor(w), rng) : w)).join(' ')
      : screenWords.join(' ');
    return {
      text: `${verb} the ${target}`,
      anchor: { screenId, elementId, knownAlias, gapKind: 'affordance-rephrase' as const },
    };
  });

  // Strategy 3: Natural language assertion patterns
  const assertionPhrases = Array.from({ length: 2 }, () => {
    const subject = words.length > 0
      ? words.map((w) => (rng() > 0.4 ? pick(domainSynonymsFor(w), rng) : w)).join(' ')
      : screenWords.join(' ');
    const pattern = pick(ASSERTION_PATTERNS, rng);
    return {
      text: pattern.replace('{subject}', subject),
      anchor: { screenId, elementId, knownAlias, gapKind: 'natural-language' as const },
    };
  });

  return [...synonymPhrases, ...affordancePhrases, ...assertionPhrases];
}

/**
 * Generate a navigation phrase using domain vocabulary.
 */
export function generateNavPhrase(
  screenId: string,
  screenAlias: string,
  rng: SeededRng,
): GapPhrase {
  const screenWords = splitIdentifier(screenId);
  const heldOutScreen = screenWords
    .map((w) => (rng() > 0.5 ? pick(domainSynonymsFor(w), rng) : w))
    .join(' ');

  const navText = pick(NAV_PATTERNS, rng).replace('{screen}', heldOutScreen);

  return {
    text: navText,
    anchor: { screenId, elementId: null, knownAlias: screenAlias, gapKind: 'domain-synonym' },
  };
}

/**
 * Generate a navigation expectation phrase.
 */
export function generateNavExpectation(screenId: string, rng: SeededRng): string {
  const screenWords = splitIdentifier(screenId);
  const heldOutScreen = screenWords
    .map((w) => (rng() > 0.5 ? pick(domainSynonymsFor(w), rng) : w))
    .join(' ');
  return pick(NAV_EXPECTATION_PATTERNS, rng).replace('{screen}', heldOutScreen);
}

/**
 * Select step text at a calibrated lexical gap distance.
 *
 * - distance=0: Use the known alias directly (identity gap — should always resolve)
 * - distance=1: Use fully held-out vocabulary (maximum gap — unlikely to resolve)
 * - distance=0.5: Mix known alias words with domain synonyms (tests generalization)
 *
 * The distance determines the probability that each word is replaced with a domain synonym.
 */
export function selectAtGapDistance(
  knownAlias: string,
  heldOutPhrases: readonly GapPhrase[],
  distance: number,
  rng: SeededRng,
  screenId = '',
  elementId: string | null = null,
): GapPhrase {
  const identityAnchor = { screenId, elementId, knownAlias, gapKind: 'identity' as const };

  // distance=0: return the known alias verbatim
  if (distance <= 0 || heldOutPhrases.length === 0) {
    return { text: knownAlias, anchor: identityAnchor };
  }

  // distance=1: pick from held-out vocabulary (maximum gap)
  if (distance >= 1) {
    return pick(heldOutPhrases, rng);
  }

  // Intermediate: blend known alias with held-out vocabulary
  // Use the distance as probability of picking held-out vs known
  return rng() < distance
    ? pick(heldOutPhrases, rng)
    : { text: knownAlias, anchor: identityAnchor };
}
