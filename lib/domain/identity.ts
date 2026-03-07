import { Brand, brandString } from './brand';

export type AdoId = Brand<string, 'AdoId'>;
export type ScreenId = Brand<string, 'ScreenId'>;
export type SectionId = Brand<string, 'SectionId'>;
export type SurfaceId = Brand<string, 'SurfaceId'>;
export type ElementId = Brand<string, 'ElementId'>;
export type PostureId = Brand<string, 'PostureId'>;
export type FixtureId = Brand<string, 'FixtureId'>;
export type SnapshotTemplateId = Brand<string, 'SnapshotTemplateId'>;
export type WidgetId = Brand<string, 'WidgetId'>;

export function createAdoId(value: string): AdoId {
  return brandString<'AdoId'>(value);
}

export function createScreenId(value: string): ScreenId {
  return brandString<'ScreenId'>(value);
}

export function createSectionId(value: string): SectionId {
  return brandString<'SectionId'>(value);
}

export function createSurfaceId(value: string): SurfaceId {
  return brandString<'SurfaceId'>(value);
}

export function createElementId(value: string): ElementId {
  return brandString<'ElementId'>(value);
}

export function createPostureId(value: string): PostureId {
  return brandString<'PostureId'>(value);
}

export function createFixtureId(value: string): FixtureId {
  return brandString<'FixtureId'>(value);
}

export function createSnapshotTemplateId(value: string): SnapshotTemplateId {
  return brandString<'SnapshotTemplateId'>(value);
}

export function createWidgetId(value: string): WidgetId {
  return brandString<'WidgetId'>(value);
}

