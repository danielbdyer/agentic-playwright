import { describe, expect, it } from 'vitest';
import { classifyVariant } from '../../../src/observe/variant.js';
import type { VariantSignals } from '../../../src/observe/in-page/walker.js';

const none: VariantSignals = {
  osuiClassCount: 0,
  osuiAnyTokenCount: 0,
  dataBlockCount: 0,
  outSystemsRuntimeGlobal: null,
  outSystemsScriptPresent: false,
  osvstatePresent: false,
  reactDetected: false,
  angularDetected: false,
  vueDetected: false,
};

describe('classifyVariant', () => {
  it('reads any one Reactive-positive signal as reactive', () => {
    expect(classifyVariant({ ...none, outSystemsRuntimeGlobal: 'OSFramework' }).variant).toBe('reactive');
    expect(classifyVariant({ ...none, outSystemsScriptPresent: true }).variant).toBe('reactive');
    expect(classifyVariant({ ...none, dataBlockCount: 3 }).variant).toBe('reactive');
    expect(classifyVariant({ ...none, osuiAnyTokenCount: 3 }).variant).toBe('reactive');
  });

  it('does not decide on corroborating signals or below-floor counts', () => {
    const verdict = classifyVariant({ ...none, reactDetected: true, dataBlockCount: 2, osuiAnyTokenCount: 2 });
    expect(verdict.variant).toBe('unknown');
    expect(verdict.evidence.join(' ')).toMatch(/React markers/);
  });

  it('lets __OSVSTATE mark Traditional Web even alongside OutSystems scripts', () => {
    expect(classifyVariant({ ...none, osvstatePresent: true }).variant).toBe('traditional');
    const both = classifyVariant({ ...none, osvstatePresent: true, outSystemsScriptPresent: true });
    expect(both.variant).toBe('traditional');
    expect(both.evidence[0]).toMatch(/__OSVSTATE/);
  });

  it('records the evidence for a reactive verdict', () => {
    const verdict = classifyVariant({ ...none, outSystemsRuntimeGlobal: 'OutSystems', dataBlockCount: 14, reactDetected: true });
    expect(verdict.evidence).toEqual(['window.OutSystems runtime global present', '14 data-block containers', 'React markers']);
  });
});
