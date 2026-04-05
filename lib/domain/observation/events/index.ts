import { DIAGNOSTICS_EVENT_KINDS } from './diagnostics';
import { GOVERNANCE_EVENT_KINDS } from './governance';
import { LIFECYCLE_EVENT_KINDS } from './lifecycle';
import { RESOLUTION_EVENT_KINDS } from './resolution';
import { SPATIAL_EVENT_KINDS } from './spatial';
import { TRANSPORT_EVENT_KINDS } from './transport';
import type { DiagnosticsEventMap } from './diagnostics';
import type { GovernanceEventMap } from './governance';
import type { LifecycleEventMap } from './lifecycle';
import type { ResolutionEventMap } from './resolution';
import type { SpatialEventMap } from './spatial';
import type { TransportEventMap } from './transport';

export * from './diagnostics';
export * from './governance';
export * from './lifecycle';
export * from './resolution';
export * from './shared';
export * from './spatial';
export * from './transport';

export const DASHBOARD_EVENT_KINDS = [
  ...LIFECYCLE_EVENT_KINDS,
  ...SPATIAL_EVENT_KINDS,
  ...RESOLUTION_EVENT_KINDS,
  ...GOVERNANCE_EVENT_KINDS,
  ...DIAGNOSTICS_EVENT_KINDS,
  ...TRANSPORT_EVENT_KINDS,
] as const;

export type DashboardEventKind = (typeof DASHBOARD_EVENT_KINDS)[number];

export type DashboardEventMap =
  & LifecycleEventMap
  & SpatialEventMap
  & ResolutionEventMap
  & GovernanceEventMap
  & DiagnosticsEventMap
  & TransportEventMap;

type MissingKinds = Exclude<DashboardEventKind, keyof DashboardEventMap>;
type ExtraMappings = Exclude<keyof DashboardEventMap, DashboardEventKind>;

type AssertTrue<T extends true> = T;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type DashboardKindCoverageCheck = AssertTrue<MissingKinds extends never ? true : false>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type DashboardPayloadCoverageCheck = AssertTrue<ExtraMappings extends never ? true : false>;
