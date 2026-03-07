import { ElementId, PostureId, SurfaceId } from './identity';
import { EffectTargetKind, PostureEffect, ScreenElements, ScreenPostures, SurfaceGraph } from './types';

export type PostureContractIssueCode =
  | 'unknown-posture'
  | 'missing-posture-values'
  | 'unknown-effect-target'
  | 'ambiguous-effect-target';

export interface PostureContractIssue {
  code: PostureContractIssueCode;
  elementId: ElementId;
  postureId: PostureId;
  target?: ElementId | SurfaceId;
}

export interface ResolveEffectTargetContext {
  effect: PostureEffect;
  elements: ScreenElements;
  surfaceGraph: SurfaceGraph;
}

const canonicalPostureIds = ['boundary', 'empty', 'invalid', 'valid'] as const;

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function effectTargetSortKey(effect: PostureEffect): string {
  const targetKind = effect.targetKind ?? 'element';
  const message = effect.message ?? '';
  return [targetKind, effect.target, effect.state, message].join('|');
}

export function normalizePostureEffects(effects: PostureEffect[]): PostureEffect[] {
  const deduped = new Map<string, PostureEffect>();

  for (const effect of effects) {
    const normalized: PostureEffect = {
      target: effect.target,
      targetKind: effect.targetKind,
      state: effect.state,
      message: effect.message ?? null,
    };

    if (normalized.target === 'self') {
      normalized.targetKind = 'self';
    }

    deduped.set(effectTargetSortKey(normalized), normalized);
  }

  return [...deduped.values()].sort((left, right) => effectTargetSortKey(left).localeCompare(effectTargetSortKey(right)));
}

export function normalizeScreenPostures(screenPostures: ScreenPostures): ScreenPostures {
  const normalizedPostures = Object.fromEntries(
    Object.entries(screenPostures.postures)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([elementId, postureMap]) => {
        const sortedPostures = Object.fromEntries(
          Object.entries(postureMap)
            .sort(([left], [right]) => {
              const leftIndex = canonicalPostureIds.indexOf(left as (typeof canonicalPostureIds)[number]);
              const rightIndex = canonicalPostureIds.indexOf(right as (typeof canonicalPostureIds)[number]);
              const leftRank = leftIndex === -1 ? canonicalPostureIds.length : leftIndex;
              const rightRank = rightIndex === -1 ? canonicalPostureIds.length : rightIndex;
              if (leftRank !== rightRank) {
                return leftRank - rightRank;
              }
              return left.localeCompare(right);
            })
            .map(([postureId, posture]) => [
              postureId,
              {
                values: uniqueSorted(posture.values),
                effects: normalizePostureEffects(posture.effects),
              },
            ]),
        );

        return [elementId, sortedPostures];
      }),
  ) as ScreenPostures['postures'];

  return {
    screen: screenPostures.screen,
    postures: normalizedPostures,
  };
}

export function resolveEffectTargetKind(context: ResolveEffectTargetContext): EffectTargetKind | 'ambiguous' | 'unknown' {
  if (context.effect.target === 'self' || context.effect.targetKind === 'self') {
    return 'self';
  }

  if (context.effect.targetKind === 'element' || context.effect.targetKind === 'surface') {
    return context.effect.targetKind;
  }

  const target = context.effect.target;
  const hasElement = Boolean(context.elements.elements[target]);
  const hasSurface = Boolean(context.surfaceGraph.surfaces[target]);

  if (hasElement && hasSurface) {
    return 'ambiguous';
  }
  if (hasSurface) {
    return 'surface';
  }
  if (hasElement) {
    return 'element';
  }
  return 'unknown';
}

export function validatePostureContract(params: {
  elementId: ElementId;
  postureId: PostureId;
  postures: ScreenPostures;
  elements: ScreenElements;
  surfaceGraph: SurfaceGraph;
}): PostureContractIssue[] {
  const postureSet = params.postures.postures[params.elementId];
  if (!postureSet) {
    return [{ code: 'unknown-posture', elementId: params.elementId, postureId: params.postureId }];
  }

  const posture = postureSet[params.postureId];
  if (!posture) {
    return [{ code: 'unknown-posture', elementId: params.elementId, postureId: params.postureId }];
  }

  const issues: PostureContractIssue[] = [];

  if (posture.values.length === 0) {
    issues.push({
      code: 'missing-posture-values',
      elementId: params.elementId,
      postureId: params.postureId,
    });
  }

  for (const effect of posture.effects) {
    const resolved = resolveEffectTargetKind({
      effect,
      elements: params.elements,
      surfaceGraph: params.surfaceGraph,
    });

    if (resolved === 'unknown') {
      issues.push({
        code: 'unknown-effect-target',
        elementId: params.elementId,
        postureId: params.postureId,
        target: effect.target === 'self' ? undefined : effect.target,
      });
      continue;
    }

    if (resolved === 'ambiguous') {
      issues.push({
        code: 'ambiguous-effect-target',
        elementId: params.elementId,
        postureId: params.postureId,
        target: effect.target === 'self' ? undefined : effect.target,
      });
    }
  }

  return issues;
}
