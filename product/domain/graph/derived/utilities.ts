import type { ScreenId } from '../../kernel/identity';
import { graphIds } from '../../kernel/ids';
import type { BoundScenario, Scenario } from '../../intent/types';
import { provenanceKindForBoundStep } from '../../governance/provenance';
import { normalizeIntentText } from '../../knowledge/inference';
import type { SharedPatternsArtifact } from '../derived-graph';

interface StepGraphContext {
  readonly step: Scenario['steps'][number];
  readonly boundStep: BoundScenario['steps'][number] | null;
}

export function basename(value: string): string {
  const parts = value.split(/[\\/]/);
  return parts.at(-1) ?? value;
}

export function basenameWithoutExtension(value: string): string {
  return basename(value).replace(/\.[^.]+$/, '');
}

export function patternFileNodeId(artifactPath: string): string {
  return graphIds.pattern(basenameWithoutExtension(artifactPath));
}

export function stepBinding(context: StepGraphContext): BoundScenario['steps'][number]['binding'] | null {
  return context.boundStep?.binding ?? null;
}

export function stepConfidence(context: StepGraphContext): Scenario['steps'][number]['confidence'] {
  return context.boundStep?.confidence ?? context.step.confidence;
}

export function stepProvenanceKind(context: StepGraphContext) {
  if (context.boundStep) {
    return provenanceKindForBoundStep(context.boundStep);
  }

  if (context.step.confidence === 'intent-only' || context.step.confidence === 'unbound') {
    return 'unresolved';
  }
  if (context.step.resolution) {
    return 'explicit';
  }
  return 'approved-knowledge';
}

export function mapKnowledgePathToNodeId(ref: string, context: StepGraphContext): string | null {
  if (ref.startsWith('knowledge/snapshots/')) {
    return graphIds.snapshot.knowledge(ref.replace(/^knowledge\//, ''));
  }

  if (ref.startsWith('knowledge/surfaces/') && ref.endsWith('.surface.yaml')) {
    return graphIds.screen(basename(ref).replace('.surface.yaml', '') as ScreenId);
  }

  if (ref.startsWith('knowledge/screens/') && ref.endsWith('.elements.yaml')) {
    if (context.step.screen && context.step.element) {
      return graphIds.element(context.step.screen, context.step.element);
    }
    return graphIds.screen(basename(ref).replace('.elements.yaml', '') as ScreenId);
  }

  if (ref.startsWith('knowledge/screens/') && ref.endsWith('.postures.yaml')) {
    if (context.step.screen && context.step.element && context.step.posture) {
      return graphIds.posture(context.step.screen, context.step.element, context.step.posture);
    }
    return graphIds.screen(basename(ref).replace('.postures.yaml', '') as ScreenId);
  }

  if (ref.startsWith('knowledge/screens/') && ref.endsWith('.hints.yaml')) {
    return graphIds.screenHints(basename(ref).replace('.hints.yaml', '') as ScreenId);
  }

  if (ref.startsWith('knowledge/patterns/')) {
    return patternFileNodeId(ref);
  }

  return null;
}

export function patternIdsForStep(stepContext: StepGraphContext, sharedPatternsArtifacts: readonly SharedPatternsArtifact[]): string[] {
  const binding = stepBinding(stepContext);
  const bindingIds = binding?.ruleId ? [graphIds.pattern(binding.ruleId)] : [];

  const postureIds = stepContext.step.posture
    ? sharedPatternsArtifacts
      .flatMap((entry) => {
        const id = entry.artifact.postures?.[stepContext.step.posture!]?.id;
        return id !== undefined && id !== null ? [graphIds.pattern(id)] : [];
      })
    : [];

  return [...new Set([...bindingIds, ...postureIds])].sort((left, right) => left.localeCompare(right));
}

export function bestAliasMatches(normalizedIntent: string, aliases: string[]): string[] {
  const matches = aliases
    .flatMap((alias) => {
      const normalized = normalizeIntentText(alias);
      return normalized.length > 0 && normalizedIntent.includes(normalized) ? [normalized] : [];
    });
  if (matches.length === 0) {
    return [];
  }
  const maxLength = Math.max(...matches.map((alias) => alias.length));
  return [...new Set(matches.filter((alias) => alias.length === maxLength))].sort((left, right) => left.localeCompare(right));
}

export type { StepGraphContext };
