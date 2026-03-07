import type { ElementId, SurfaceId } from './identity';
import type { PostureEffect, ScreenElements, SurfaceGraph } from './types';

export type EffectTargetRef =
  | {
      kind: 'self';
    }
  | {
      kind: 'element';
      elementId: ElementId;
    }
  | {
      kind: 'surface';
      surfaceId: SurfaceId;
    };

export type EffectTargetRefErrorCode = 'unknown-effect-target' | 'ambiguous-effect-target';

export interface EffectTargetRefError {
  code: EffectTargetRefErrorCode;
  target: ElementId | SurfaceId;
}

export type EffectTargetRefResult =
  | {
      ok: true;
      value: EffectTargetRef;
    }
  | {
      ok: false;
      error: EffectTargetRefError;
    };

export interface ResolveEffectTargetContext {
  effect: PostureEffect;
  elements: ScreenElements;
  surfaceGraph: SurfaceGraph;
}

export function effectTargetSelf(): EffectTargetRef {
  return { kind: 'self' };
}

export function effectTargetElement(elementId: ElementId): EffectTargetRef {
  return { kind: 'element', elementId };
}

export function effectTargetSurface(surfaceId: SurfaceId): EffectTargetRef {
  return { kind: 'surface', surfaceId };
}

export function parseEffectTargetRef(context: ResolveEffectTargetContext): EffectTargetRefResult {
  if (context.effect.target === 'self' || context.effect.targetKind === 'self') {
    return { ok: true, value: effectTargetSelf() };
  }

  if (context.effect.targetKind === 'element') {
    return { ok: true, value: effectTargetElement(context.effect.target as ElementId) };
  }

  if (context.effect.targetKind === 'surface') {
    return { ok: true, value: effectTargetSurface(context.effect.target as SurfaceId) };
  }

  const target = context.effect.target as ElementId | SurfaceId;
  const hasElement = Boolean(context.elements.elements[target]);
  const hasSurface = Boolean(context.surfaceGraph.surfaces[target]);

  if (hasElement && hasSurface) {
    return {
      ok: false,
      error: {
        code: 'ambiguous-effect-target',
        target,
      },
    };
  }

  if (hasSurface) {
    return { ok: true, value: effectTargetSurface(target as SurfaceId) };
  }

  if (hasElement) {
    return { ok: true, value: effectTargetElement(target as ElementId) };
  }

  return {
    ok: false,
    error: {
      code: 'unknown-effect-target',
      target,
    },
  };
}

export function normalizePostureEffectTarget(effect: PostureEffect): PostureEffect {
  if (effect.target === 'self' || effect.targetKind === 'self') {
    return {
      ...effect,
      target: 'self',
      targetKind: 'self',
    };
  }

  return effect;
}
