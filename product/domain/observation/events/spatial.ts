import type { Governance, ResolutionMode } from '../../governance/workflow-types';

export const SPATIAL_EVENT_KINDS = [
  'element-probed',
  'screen-captured',
  'element-escalated',
  'inbox-item-arrived',
  'fiber-paused',
  'fiber-resumed',
  'surface-discovered',
  'route-navigated',
  'aria-tree-captured',
] as const;

export type ActorKind = 'system' | 'agent' | 'operator';

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type InboxUrgency = 'blocking' | 'queued';

export interface ElementProbedEvent {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly boundingBox: BoundingBox | null;
  readonly locatorRung: number;
  readonly strategy: string;
  readonly found: boolean;
  readonly confidence: number;
  readonly actor: ActorKind;
  readonly governance: Governance;
  readonly resolutionMode: ResolutionMode;
}

export interface ScreenCapturedEvent {
  readonly imageBase64: string;
  readonly width: number;
  readonly height: number;
  readonly url: string;
}

export interface ElementEscalatedEvent {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly fromActor: ActorKind;
  readonly toActor: ActorKind;
  readonly reason: string;
  readonly governance: Governance;
  readonly boundingBox: BoundingBox | null;
}

export interface InboxItemEvent {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly urgency: InboxUrgency;
  readonly reason: string;
  readonly governance: Governance;
  readonly relatedWorkItemId: string | null;
}

export interface FiberPauseEvent {
  readonly workItemId: string;
  readonly reason: string;
  readonly screen: string;
  readonly element: string | null;
}

export interface FiberResumeEvent {
  readonly workItemId: string;
  readonly decision: 'completed' | 'skipped';
}

export interface SurfaceDiscoveredEvent {
  readonly screen: string;
  readonly region: string;
  readonly role: string;
  readonly boundingBox: BoundingBox;
  readonly childCount: number;
}

export interface RouteNavigatedEvent {
  readonly url: string;
  readonly screenId: string | null;
  readonly isSeeded: boolean;
}

export interface AriaTreeCapturedEvent {
  readonly screen: string;
  readonly nodeCount: number;
  readonly landmarkCount: number;
  readonly interactableCount: number;
}

export interface SpatialEventMap {
  readonly 'element-probed': ElementProbedEvent;
  readonly 'screen-captured': ScreenCapturedEvent;
  readonly 'element-escalated': ElementEscalatedEvent;
  readonly 'inbox-item-arrived': InboxItemEvent;
  readonly 'fiber-paused': FiberPauseEvent;
  readonly 'fiber-resumed': FiberResumeEvent;
  readonly 'surface-discovered': SurfaceDiscoveredEvent;
  readonly 'route-navigated': RouteNavigatedEvent;
  readonly 'aria-tree-captured': AriaTreeCapturedEvent;
}
