/**
 * OutSystems variant classification, lifted from
 * workshop/substrate-study/application/variant-classifier.ts.
 *
 * Reactive-positive signals (any one suffices): the runtime global
 * (window.OutSystems / OSFramework), an OutSystems runtime bundle in a
 * script tag, at least three data-block containers, at least three osui-*
 * class tokens. The __OSVSTATE hidden input is the Traditional Web marker
 * and wins over the Reactive signals (Traditional pages also load
 * OutSystems scripts). Framework markers corroborate only.
 */
import type { Variant } from '../contract/schemas.js';
import type { VariantSignals } from './in-page/walker.js';

export type { VariantSignals } from './in-page/walker.js';

/** Real Reactive routes carried 11-164 data-block containers; three clears chrome-only false positives. */
const DATA_BLOCK_FLOOR = 3;
const OSUI_STANDALONE_FLOOR = 3;

export interface VariantVerdict {
  readonly variant: Variant;
  readonly evidence: readonly string[];
}

export const classifyVariant = (signals: VariantSignals): VariantVerdict => {
  const positives = [
    ...(signals.outSystemsRuntimeGlobal !== null ? [`window.${signals.outSystemsRuntimeGlobal} runtime global present`] : []),
    ...(signals.outSystemsScriptPresent ? ['OutSystems runtime bundle referenced by a script tag'] : []),
    ...(signals.dataBlockCount >= DATA_BLOCK_FLOOR ? [`${signals.dataBlockCount} data-block containers`] : []),
    ...(signals.osuiAnyTokenCount >= OSUI_STANDALONE_FLOOR ? [`${signals.osuiAnyTokenCount} osui-* class tokens`] : []),
  ];
  const corroborating = [
    ...(signals.reactDetected ? ['React markers'] : []),
    ...(signals.angularDetected ? ['Angular markers'] : []),
    ...(signals.vueDetected ? ['Vue markers'] : []),
    ...(signals.osuiAnyTokenCount > 0 && signals.osuiAnyTokenCount < OSUI_STANDALONE_FLOOR
      ? [`${signals.osuiAnyTokenCount} osui-* class token(s), below the standalone floor`]
      : []),
  ];
  if (signals.osvstatePresent) {
    return {
      variant: 'traditional',
      evidence: ['__OSVSTATE hidden input present (Traditional Web)', ...positives.map((p) => `also: ${p}`)],
    };
  }
  if (positives.length > 0) return { variant: 'reactive', evidence: [...positives, ...corroborating] };
  return {
    variant: 'unknown',
    evidence: [
      `no OutSystems signal: runtime global absent, script ${signals.outSystemsScriptPresent ? 'present' : 'absent'}, ` +
        `${signals.dataBlockCount} data-block, ${signals.osuiAnyTokenCount} osui-* tokens`,
      ...corroborating,
    ],
  };
};
