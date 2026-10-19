import { describe, expect, it } from 'vitest';
import {
  analyzeTarget,
  canonicalKey,
  landmarkForCue,
  matchParameter,
  nameSimilarity,
  plainText,
  readKey,
  readValue,
  referent,
} from '../../../src/resolve/index.js';
import { containsBounded, maskQuotes, unmask } from '../../../src/resolve/phrase.js';

describe('keys', () => {
  it('names real keys and their common spellings', () => {
    expect(canonicalKey('esc')).toBe('Escape');
    expect(canonicalKey('return')).toBe('Enter');
    expect(canonicalKey('Page Down')).toBe('PageDown');
    expect(canonicalKey('Submit')).toBeNull();
  });

  it('reads a key with what follows it, and refuses a control named like a key', () => {
    expect(readKey('Enter to submit')).toEqual({ key: 'Enter', rest: 'to submit' });
    expect(readKey('the Tab key')).toEqual({ key: 'Tab', rest: '' });
    expect(readKey('Ctrl + A')).toEqual({ key: 'Control+A', rest: '' });
    expect(readKey('the Enter button')).toBeNull();
    expect(readKey('Submit')).toBeNull();
    expect(readKey('Ctrl+Submit')).toBeNull();
  });
});

describe('text', () => {
  it('decodes numeric and double-encoded entities and strips tags', () => {
    expect(plainText('&lt;div&gt;Click &amp;quot;Save&amp;quot;&lt;/div&gt;')).toBe('Click "Save"');
    expect(plainText('<p>Enter&#160;@x&#x20;now</p>')).toBe('Enter @x now');
    expect(plainText('Click “Save” – now')).toBe('Click "Save" - now');
    expect(plainText('Enter a value < 5')).toBe('Enter a value < 5');
  });

  it('masks quotes but not apostrophes', () => {
    const masked = maskQuotes(`Click the user's "Save & Close" button and 'OK'`);
    expect(masked.quotes).toEqual(['Save & Close', 'OK']);
    expect(masked.text).toContain("user's");
    expect(unmask(masked.text, masked.quotes)).toBe(`Click the user's Save & Close button and OK`);
  });

  it('compares names even when every word is a stopword', () => {
    expect(nameSimilarity('Confirm', 'Confirm')).toBe(1);
    expect(nameSimilarity('Confirm', 'Confirm order')).toBeGreaterThan(0.5);
    expect(nameSimilarity('Save', 'Cancel')).toBe(0);
  });

  it('bounds containment at word-ish edges', () => {
    expect(containsBounded('POL-001 John Smith', 'POL-001')).toBe(true);
    expect(containsBounded('POL-0010 Jane', 'POL-001')).toBe(false);
    expect(containsBounded('Search Policy', 'policy')).toBe(true);
  });
});

describe('targets and landmarks', () => {
  it('maps cue words to landmarks: header is banner, search only as a search control', () => {
    expect(landmarkForCue('header')).toBe('banner');
    expect(landmarkForCue('top bar')).toBe('navigation');
    expect(landmarkForCue('search box')).toBe('search');
    expect(landmarkForCue('search')).toBe('search');
    expect(analyzeTarget('Search button', 'action').landmarkCue).toBeNull();
    expect(analyzeTarget('the search bar', 'fill')).toMatchObject({ landmarkCue: 'search', roleHint: 'textbox' });
    expect(analyzeTarget('Name column header', 'action')).toMatchObject({ roleHint: 'columnheader', landmarkCue: null, phrase: 'Name' });
  });

  it('reads "box" by the verb around it', () => {
    expect(analyzeTarget('the Terms box', 'check').roleHint).toBe('checkbox');
    expect(analyzeTarget('the State box', 'select').roleHint).toBe('combobox');
    expect(analyzeTarget('the Notes box', 'fill').roleHint).toBe('textbox');
  });

  it('notes a row named by position instead of guessing', () => {
    const target = analyzeTarget('the Edit link in the first row', 'action');
    expect(target.rowCue).toBeNull();
    expect(target.phrase).toBe('Edit');
    expect(target.notes.join(' ')).toMatch(/by position/);
  });
});

describe('values and parameters', () => {
  const ctx = { parameters: ['policyNumber', 'lastName'] };

  it('matches parameters by their words', () => {
    expect(matchParameter('policy number', ctx.parameters)).toBe('policyNumber');
    expect(matchParameter('the Policy Number', ctx.parameters)).toBe('policyNumber');
    expect(matchParameter('a valid policy number', ctx.parameters)).toBe('policyNumber');
    expect(matchParameter('last name', ctx.parameters)).toBe('lastName');
    expect(matchParameter('name', ctx.parameters)).toBeNull();
    expect(matchParameter('policy', ctx.parameters)).toBeNull();
  });

  it('reads literals, parameters and descriptions', () => {
    expect(readValue('"POL-001"', ctx)).toMatchObject({ value: 'POL-001', source: 'literal' });
    expect(readValue('@PolicyNumber', ctx)).toMatchObject({ value: '@policyNumber', source: 'param', note: null });
    expect(readValue('{lastName}', ctx)).toMatchObject({ value: '@lastName', source: 'param' });
    expect(readValue('POL-001', ctx)).toMatchObject({ value: 'POL-001', source: 'literal' });
    expect(readValue('John Smith', ctx)).toMatchObject({ value: 'John Smith', source: 'literal' });
    expect(readValue('the value 42', ctx)).toMatchObject({ value: '42', source: 'literal' });
    expect(readValue('a password', ctx)).toMatchObject({ value: null, source: 'description' });
    expect(readValue('"@lastName"', ctx)).toMatchObject({ value: '@lastName', source: 'param' });
    expect(readValue('Smith', { parameters: ['lastName'], dataRow: { lastName: 'Smith' } })).toMatchObject({ value: '@lastName', source: 'param' });
  });

  it('resolves references in expected results to earlier values', () => {
    const refs = { parameters: ['policyNumber'], stepValue: null, priorValues: ['Buy milk', '@policyNumber'] };
    expect(referent('Matching policy', refs, true)).toBe('@policyNumber');
    expect(referent('the todo', { ...refs, priorValues: ['Buy milk'] }, true)).toBe('Buy milk');
    expect(referent('Matching policy', refs, false)).toBeNull();
    expect(referent('"Saved"', refs, false)).toBe('Saved');
    expect(referent('policy POL-777', refs, false)).toBe('POL-777');
    expect(referent('results', { ...refs, priorValues: [] }, true)).toBeNull();
  });
});
