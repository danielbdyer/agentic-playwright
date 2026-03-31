import { expect, test } from '@playwright/test';
import { createSeededRng } from '../lib/domain/random';
import { generateHeldOutPhrases, generateNavPhrase, selectAtGapDistance } from '../lib/domain/synthesis/translation-gap';

const GENERATED_GAP_KINDS = ['domain-synonym', 'affordance-rephrase', 'natural-language'] as const;

// ─── Held-out vocabulary generation laws ───

test.describe('held-out vocabulary generation laws', () => {
  test('generates phrases that are NOT the known alias', () => {
    const rng = createSeededRng('held-out-1');
    const phrases = generateHeldOutPhrases('policyNumberInput', 'os-input', 'policy-search', rng);

    // Should produce multiple phrases
    expect(phrases.length).toBeGreaterThan(0);

    // Phrases should NOT be the humanized element ID verbatim
    const humanized = 'policy number input';
    const nonIdentity = phrases.filter((p) => p.text.toLowerCase() !== humanized);
    expect(nonIdentity.length).toBeGreaterThan(0);
  });

  test('includes domain synonym substitutions', () => {
    const rng = createSeededRng('domain-synonyms');
    const phrases = generateHeldOutPhrases('policyNumber', 'os-region', 'policy-detail', rng);

    const allText = phrases.map((p) => p.text.toLowerCase()).join(' ');

    // Should include domain synonyms for "policy" (coverage, plan, insurance, account, etc.)
    const domainTerms = ['coverage', 'plan', 'insurance', 'account', 'contract', 'certificate',
      'id', 'identifier', 'reference', 'code', 'ref'];
    const matches = domainTerms.filter((term) => allText.includes(term.toLowerCase()));
    expect(matches.length).toBeGreaterThan(0);
  });

  test('includes affordance-based verb phrases', () => {
    const rng = createSeededRng('affordance-verbs');
    const phrases = generateHeldOutPhrases('searchButton', 'os-button', 'policy-search', rng);

    const allText = phrases.map((p) => p.text.toLowerCase()).join(' ');

    // Button affordance verbs: click, press, hit, tap, activate, use, trigger
    const affordanceVerbs = ['click', 'press', 'hit', 'tap', 'activate', 'use', 'trigger'];
    const matches = affordanceVerbs.filter((verb) => allText.includes(verb));
    expect(matches.length).toBeGreaterThan(0);
  });

  test('includes natural language assertion patterns', () => {
    const rng = createSeededRng('nl-assertions');
    const phrases = generateHeldOutPhrases('claimsTable', 'os-table', 'policy-detail', rng);

    const allText = phrases.map((p) => p.text.toLowerCase()).join(' ');

    // Should include assertion patterns like "is displayed", "shows", "correct", "visible"
    const assertionTerms = ['displayed', 'shows', 'correct', 'visible', 'present', 'loaded', 'page'];
    const matches = assertionTerms.filter((term) => allText.includes(term));
    expect(matches.length).toBeGreaterThan(0);
  });

  test('determinism: same inputs produce same phrases', () => {
    const rng1 = createSeededRng('determinism');
    const rng2 = createSeededRng('determinism');

    const phrases1 = generateHeldOutPhrases('policyNumber', 'os-region', 'policy-detail', rng1);
    const phrases2 = generateHeldOutPhrases('policyNumber', 'os-region', 'policy-detail', rng2);

    expect(phrases1.map((p) => p.text)).toEqual(phrases2.map((p) => p.text));
  });

  test('every phrase has a ground truth anchor', () => {
    const rng = createSeededRng('anchors');
    const phrases = generateHeldOutPhrases('effectiveDate', 'os-region', 'policy-detail', rng);

    for (const phrase of phrases) {
      expect(phrase.anchor).toBeDefined();
      expect(phrase.anchor.screenId).toBe('policy-detail');
      expect(phrase.anchor.elementId).toBe('effectiveDate');
      expect(GENERATED_GAP_KINDS).toContain(phrase.anchor.gapKind);
    }
  });
});

// ─── Navigation phrase generation laws ───

test.describe('navigation phrase generation laws', () => {
  test('generates navigation phrases with screen context', () => {
    const rng = createSeededRng('nav-phrase');
    const phrase = generateNavPhrase('policy-search', 'policy search', rng);

    expect(phrase.text).toBeTruthy();
    expect(phrase.anchor.screenId).toBe('policy-search');
    expect(phrase.anchor.elementId).toBeNull();
  });

  test('navigation phrases contain domain vocabulary', () => {
    // Use deterministic seeds for each phrase
    const phrases = Array.from({ length: 10 }, (_, i) =>
      generateNavPhrase('policy-detail', 'policy detail', createSeededRng(`nav-domain-${i}`)),
    );

    const allText = phrases.map((p) => p.text.toLowerCase()).join(' ');

    // Should contain navigation verbs
    const navVerbs = ['go to', 'open', 'navigate', 'pull up', 'access', 'load', 'visit', 'bring up'];
    const matches = navVerbs.filter((verb) => allText.includes(verb));
    expect(matches.length).toBeGreaterThan(0);
  });
});

// ─── Gap distance selection laws ───

test.describe('gap distance selection laws', () => {
  test('distance=0 returns the known alias verbatim', () => {
    const rng = createSeededRng('dist-zero');
    const heldOut = generateHeldOutPhrases('policyNumber', 'os-region', 'policy-detail', rng);

    const rng2 = createSeededRng('dist-zero-select');
    const result = selectAtGapDistance('policy number', heldOut, 0, rng2);

    expect(result.text).toBe('policy number');
    expect(result.anchor.gapKind).toBe('identity');
  });

  test('distance=1 always returns held-out vocabulary', () => {
    const rng = createSeededRng('dist-one');
    const heldOut = generateHeldOutPhrases('policyNumber', 'os-region', 'policy-detail', rng);

    const rng2 = createSeededRng('dist-one-select');
    const result = selectAtGapDistance('policy number', heldOut, 1, rng2);

    expect(result.anchor.gapKind).not.toBe('identity');
    // The text should be from the held-out pool
    const heldOutTexts = heldOut.map((p) => p.text);
    expect(heldOutTexts).toContain(result.text);
  });

  test('distance=0.5 produces a mix of partial-gap and fully held-out phrasing', () => {
    const rng = createSeededRng('dist-half');
    const heldOut = generateHeldOutPhrases('policyNumber', 'os-region', 'policy-detail', rng);

    const samples = Array.from({ length: 100 }, (_, i) => {
      const sampleRng = createSeededRng(`dist-half-${i}`);
      return selectAtGapDistance('policy number', heldOut, 0.5, sampleRng);
    });

    const partialGapCount = samples.filter((sample) => sample.anchor.gapKind === 'partial-gap').length;
    const heldOutCount = samples.filter((sample) =>
      sample.anchor.gapKind !== 'identity' && sample.anchor.gapKind !== 'partial-gap',
    ).length;

    expect(partialGapCount).toBeGreaterThan(10);
    expect(heldOutCount).toBeGreaterThan(10);
  });

  test('intermediate distances can synthesize partial lexical gaps rather than only binary jumps', () => {
    const samples = Array.from({ length: 40 }, (_, i) => {
      const heldOut = generateHeldOutPhrases(
        'policyNumber',
        'os-region',
        'policy-detail',
        createSeededRng(`partial-gap-heldout-${i}`),
      );
      return selectAtGapDistance('policy number', heldOut, 0.5, createSeededRng(`partial-gap-select-${i}`));
    });

    const partialGapSamples = samples.filter((sample) => sample.anchor.gapKind === 'partial-gap');

    expect(partialGapSamples.length).toBeGreaterThan(0);
    for (const sample of partialGapSamples) {
      expect(sample.text.toLowerCase()).not.toBe('policy number');
      expect(sample.text.toLowerCase()).not.toBe('policyNumber'.toLowerCase());
    }
  });

  test('distance values outside the supported range are clamped safely', () => {
    const heldOut = generateHeldOutPhrases(
      'policyNumber',
      'os-region',
      'policy-detail',
      createSeededRng('clamp-heldout'),
    );

    const belowRange = selectAtGapDistance('policy number', heldOut, -1, createSeededRng('clamp-low'));
    const aboveRange = selectAtGapDistance('policy number', heldOut, 2, createSeededRng('clamp-high'));

    expect(belowRange.anchor.gapKind).toBe('identity');
    expect(aboveRange.anchor.gapKind).not.toBe('identity');
  });
});
