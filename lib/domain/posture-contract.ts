import type { ElementId, PostureId, SurfaceId } from './identity';
import type { ResolveEffectTargetContext } from './effect-target';
import { normalizePostureEffectTarget, parseEffectTargetRef } from './effect-target';
import type { PostureEffect, ScreenElements, ScreenPostures, SurfaceGraph } from './types';
import { compareStrings, uniqueSorted } from './collections';

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

const canonicalPostureIds = ['boundary', 'empty', 'invalid', 'valid'] as const;

function effectTargetSortKey(effect: PostureEffect): string {
  const targetKind = effect.targetKind ?? 'element';
  const message = effect.message ?? '';
  return [targetKind, effect.target, effect.state, message].join('|');
}

export function normalizePostureEffects(effects: readonly PostureEffect[]): readonly PostureEffect[] {
  const entries = effects.map((effect) => {
    const normalized = normalizePostureEffectTarget({
      target: effect.target,
      targetKind: effect.targetKind,
      state: effect.state,
      message: effect.message ?? null,
    });
    return [effectTargetSortKey(normalized), normalized] as const;
  });
  return [...new Map(entries).values()]
    .sort((left, right) => effectTargetSortKey(left).localeCompare(effectTargetSortKey(right)));
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
              return compareStrings(left, right);
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

export function resolveEffectTargetRef(context: ResolveEffectTargetContext) {
  return parseEffectTargetRef(context);
}

export function resolveEffectTargetKind(context: ResolveEffectTargetContext): 'self' | 'element' | 'surface' | 'ambiguous' | 'unknown' {
  const result = parseEffectTargetRef(context);
  if (!result.ok) {
    return result.error.code === 'ambiguous-effect-target' ? 'ambiguous' : 'unknown';
  }

  return result.value.kind;
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

  const missingValuesIssue: PostureContractIssue[] = posture.values.length === 0
    ? [{ code: 'missing-posture-values', elementId: params.elementId, postureId: params.postureId }]
    : [];

  const effectIssues: PostureContractIssue[] = posture.effects.flatMap((effect) => {
    const resolved = resolveEffectTargetRef({
      effect,
      elements: params.elements,
      surfaceGraph: params.surfaceGraph,
    });

    return resolved.ok
      ? []
      : [{
          code: resolved.error.code,
          elementId: params.elementId,
          postureId: params.postureId,
          target: resolved.error.target,
        } satisfies PostureContractIssue];
  });

  return [...missingValuesIssue, ...effectIssues];
}

