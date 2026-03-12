import type { RuntimeKnowledgeSession, ScenarioTaskPacket, StepTask } from '../domain/types';

export function runtimeKnowledgeForStep(
  task: StepTask,
  runtimeKnowledgeSession?: RuntimeKnowledgeSession | null,
): RuntimeKnowledgeSession {
  if (task.runtimeKnowledge) {
    return task.runtimeKnowledge;
  }
  if (task.knowledgeRef === 'scenario' && runtimeKnowledgeSession) {
    return runtimeKnowledgeSession;
  }
  if (runtimeKnowledgeSession) {
    return runtimeKnowledgeSession;
  }
  throw new Error(`Missing runtime knowledge for step ${task.index}`);
}

export function runtimeKnowledgeForPacket(packet: ScenarioTaskPacket): RuntimeKnowledgeSession | undefined {
  return undefined;
}
