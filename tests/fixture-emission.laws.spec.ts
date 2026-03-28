import { expect, test } from '@playwright/test';
import {
  convertToFixtureRef,
  emitDatasetReference,
  emitPostureVariant,
  extractHardcodedFromRef,
  isHardcodedLiteral,
  type DataBinding,
} from '../lib/domain/fixture-emission';
import { mulberry32, randomWord } from './support/random';

// ─── Helpers ───

function syntheticBinding(next: () => number): DataBinding {
  return {
    datasetId: randomWord(next),
    field: randomWord(next),
    value: next() > 0.3 ? randomWord(next) : null,
  };
}

// ─── Law 1: Dataset reference is not a hardcoded literal ───

test('Law 1: dataset reference is not a hardcoded literal (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const binding = syntheticBinding(next);
    const ref = emitDatasetReference(binding);

    // A dataset reference should not be detected as a hardcoded literal
    expect(isHardcodedLiteral(ref)).toBe(false);

    // It should start with the fixture prefix
    expect(ref.startsWith('fixture:')).toBe(true);

    // It should contain both the dataset ID and the field
    expect(ref).toContain(binding.datasetId);
    expect(ref).toContain(binding.field);
  }
});

// ─── Law 2: Posture variant includes both posture and variant identifiers ───

test('Law 2: posture variant includes both posture and variant identifiers (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const posture = randomWord(next);
    const variant = randomWord(next);
    const result = emitPostureVariant(posture, variant);

    // Result contains both identifiers separated by /
    expect(result).toContain(posture);
    expect(result).toContain(variant);
    expect(result).toBe(`${posture}/${variant}`);

    // Splitting on / recovers both parts
    const parts = result.split('/');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(posture);
    expect(parts[1]).toBe(variant);
  }
});

// ─── Law 3: Hardcoded literal detection is accurate ───

test('Law 3: hardcoded literal detection is accurate (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const literal = randomWord(next);
    const binding = syntheticBinding(next);
    const fixtureRef = emitDatasetReference(binding);

    // Random words are hardcoded literals
    expect(isHardcodedLiteral(literal)).toBe(true);

    // Fixture references are not hardcoded literals
    expect(isHardcodedLiteral(fixtureRef)).toBe(false);

    // Empty string is not a hardcoded literal
    expect(isHardcodedLiteral('')).toBe(false);
  }
});

// ─── Law 4: Conversion to fixture ref is reversible (round-trip) ───

test('Law 4: conversion to fixture ref is reversible — round-trip (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const hardcoded = randomWord(next);
    const datasetId = randomWord(next);

    const ref = convertToFixtureRef(hardcoded, datasetId);
    const extracted = extractHardcodedFromRef(ref);

    // Round-trip: we can recover the original value and dataset
    expect(extracted).not.toBeNull();
    expect(extracted!.datasetId).toBe(datasetId);
    expect(extracted!.field).toBe(hardcoded);

    // The reference itself is not a hardcoded literal
    expect(isHardcodedLiteral(ref)).toBe(false);
  }
});

// ─── Law 5: Fixture refs follow consistent naming convention ───

test('Law 5: fixture refs follow consistent naming convention (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const binding = syntheticBinding(next);
    const ref = emitDatasetReference(binding);

    // Must start with "fixture:" prefix
    expect(ref).toMatch(/^fixture:/);

    // Must have format fixture:{datasetId}.{field}
    const body = ref.slice('fixture:'.length);
    const dotIndex = body.indexOf('.');
    expect(dotIndex).toBeGreaterThan(0);

    const parsedDatasetId = body.slice(0, dotIndex);
    const parsedField = body.slice(dotIndex + 1);
    expect(parsedDatasetId).toBe(binding.datasetId);
    expect(parsedField).toBe(binding.field);
  }
});

// ─── Law 6: Empty/null values handled gracefully ───

test('Law 6: empty and edge-case values handled gracefully (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const datasetId = randomWord(next);

    // Empty string is not a hardcoded literal
    expect(isHardcodedLiteral('')).toBe(false);

    // Binding with null value still produces a valid reference
    const binding: DataBinding = { datasetId, field: randomWord(next), value: null };
    const ref = emitDatasetReference(binding);
    expect(ref.startsWith('fixture:')).toBe(true);
    expect(isHardcodedLiteral(ref)).toBe(false);

    // Posture variant with empty strings defaults gracefully
    const variantResult = emitPostureVariant('', '');
    expect(variantResult).toBe('default/default');
    expect(variantResult.split('/')).toHaveLength(2);

    // Posture variant with whitespace-only strings defaults gracefully
    const whitespaceResult = emitPostureVariant('  ', '  ');
    expect(whitespaceResult).toBe('default/default');

    // extractHardcodedFromRef on non-reference returns null
    const literal = randomWord(next);
    expect(extractHardcodedFromRef(literal)).toBeNull();

    // Round-trip with special characters (dots, colons)
    const specialValue = `${randomWord(next)}.${randomWord(next)}:${randomWord(next)}`;
    const specialRef = convertToFixtureRef(specialValue, datasetId);
    const extracted = extractHardcodedFromRef(specialRef);
    expect(extracted).not.toBeNull();
    expect(extracted!.field).toBe(specialValue);
    expect(extracted!.datasetId).toBe(datasetId);
  }
});
