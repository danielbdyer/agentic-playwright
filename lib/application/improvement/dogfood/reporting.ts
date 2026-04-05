import type { LearningSignalsSummary } from '../../../domain/improvement/types';

export function getDegradingDimensionNames(ls: LearningSignalsSummary): readonly string[] {
  const dims: string[] = [];
  if (ls.timingRegressionRate > 0.3) dims.push('timingRegression');
  if (ls.selectorFlakinessRate > 0.3) dims.push('selectorFlakiness');
  if (ls.consoleNoiseLevel > 0.3) dims.push('consoleNoise');
  if (ls.recoveryEfficiency < 0.5) dims.push('recoveryEfficiency');
  if (ls.costEfficiency < 0.5) dims.push('costEfficiency');
  if (ls.rungStability < 0.5) dims.push('rungStability');
  if (ls.componentMaturityRate < 0.5) dims.push('componentMaturity');
  return dims;
}
