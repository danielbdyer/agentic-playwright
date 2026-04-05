import type { FlywheelAct } from '../types';

const stageToAct = (stage: string | null, phase: string | null): FlywheelAct => {
  const token = `${stage ?? ''} ${phase ?? ''}`.toLowerCase();
  if (token.includes('capture') || token.includes('probe')) return 2;
  if (token.includes('slice') || token.includes('priorit')) return 3;
  if (token.includes('compile') || token.includes('bind') || token.includes('emit') || token.includes('generation')) return 4;
  if (token.includes('execute') || token.includes('run') || token.includes('resolution')) return 5;
  if (token.includes('gate') || token.includes('trust') || token.includes('approval')) return 6;
  if (token.includes('measure') || token.includes('score') || token.includes('convergence')) return 7;
  return 1;
};

export function useFlywheelAct(activeStage: string | null, progressPhase: string | null): FlywheelAct {
  return stageToAct(activeStage, progressPhase);
}
