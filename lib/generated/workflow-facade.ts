import { createRefPath } from '../domain/ref-path';
import type { ValueRef } from '../domain/types';
import type { ElementId, FixtureId, ScreenId, ScreenPostureId, SnapshotTemplateId, SurfaceId } from './tesseract-knowledge';

export interface WorkflowDirectiveInput<S extends ScreenId = ScreenId> {
  screen: S;
  element: ElementId<S>;
  action: 'input';
  posture: ScreenPostureId<S> | null;
  value: ValueRef | null;
}

export interface WorkflowDirectiveClick<S extends ScreenId = ScreenId> {
  screen: S;
  element: ElementId<S>;
  action: 'click';
}

export interface WorkflowDirectiveSnapshot<S extends ScreenId = ScreenId> {
  screen: S;
  element: ElementId<S>;
  action: 'assert-snapshot';
  snapshot: SnapshotTemplateId;
}

export interface WorkflowSurfaceRef<S extends ScreenId = ScreenId> {
  screen: S;
  surface: SurfaceId<S>;
}

export type WorkflowDirective =
  | WorkflowDirectiveInput
  | WorkflowDirectiveClick
  | WorkflowDirectiveSnapshot
  | WorkflowSurfaceRef;

export interface WorkflowStepHandshake<TTask> {
  task: TTask;
  directive: WorkflowDirective | null;
}

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

export const workflow = {
  screen<S extends ScreenId>(screen: S) {
    return {
      surface<T extends SurfaceId<S>>(surface: T): WorkflowSurfaceRef<S> {
        return {
          screen,
          surface,
        };
      },
      element<E extends ElementId<S>>(element: E) {
        return {
          input(value: ValueRef | null, posture?: ScreenPostureId<S>): WorkflowDirectiveInput<S> {
            return {
              screen,
              element,
              action: 'input',
              posture: posture ?? null,
              value,
            };
          },
          click(): WorkflowDirectiveClick<S> {
            return {
              screen,
              element,
              action: 'click',
            };
          },
          observeStructure(snapshot: SnapshotTemplateId): WorkflowDirectiveSnapshot<S> {
            return {
              screen,
              element,
              action: 'assert-snapshot',
              snapshot,
            };
          },
        };
      },
    };
  },
  step<TTask>(task: TTask, directive: WorkflowDirective | null = null): WorkflowStepHandshake<TTask> {
    return {
      task,
      directive,
    };
  },
};

export const agent = workflow;
