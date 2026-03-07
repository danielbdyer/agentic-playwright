import { createRefPath } from '../domain/ref-path';
import { ValueRef } from '../domain/types';
import type { ElementId, FixtureId, ScreenId, ScreenPostureId, SnapshotTemplateId, SurfaceId } from './tesseract-knowledge';

export function literal(value: string): ValueRef {
  return { kind: 'literal', value };
}

export function fixture<F extends FixtureId>(name: F, ...path: string[]): ValueRef {
  return {
    kind: 'fixture-path',
    path: createRefPath(name, ...path),
  };
}

export function generatedToken(token: string): ValueRef {
  return {
    kind: 'generated-token',
    token,
  };
}

export const agent = {
  screen<S extends ScreenId>(screen: S) {
    return {
      surface<T extends SurfaceId<S>>(surface: T) {
        return {
          screen,
          surface,
        };
      },
      element<E extends ElementId<S>>(element: E) {
        return {
          input(value: ValueRef, posture?: ScreenPostureId<S>) {
            return {
              screen,
              element,
              action: 'input' as const,
              posture: posture ?? null,
              value,
            };
          },
          click() {
            return {
              screen,
              element,
              action: 'click' as const,
            };
          },
          observeStructure(snapshot: SnapshotTemplateId) {
            return {
              screen,
              element,
              action: 'assert-snapshot' as const,
              snapshot,
            };
          },
        };
      },
    };
  },
};
