import { Brand, brandString } from './brand';
import { SchemaError } from './errors';

export type AdoId = Brand<string, 'AdoId'>;
export type ScreenId = Brand<string, 'ScreenId'>;
export type SectionId = Brand<string, 'SectionId'>;
export type SurfaceId = Brand<string, 'SurfaceId'>;
export type ElementId = Brand<string, 'ElementId'>;
export type PostureId = Brand<string, 'PostureId'>;
export type FixtureId = Brand<string, 'FixtureId'>;
export type SnapshotTemplateId = Brand<string, 'SnapshotTemplateId'>;
export type WidgetId = Brand<string, 'WidgetId'>;

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}

export function ensureSafeRelativePathLike(value: string, path: string): string {
  const normalized = normalizePathSeparators(value.trim());
  const segments = normalized.split('/').filter((segment) => segment.length > 0);

  if (!normalized) {
    throw new SchemaError('expected non-empty path-like identifier', path);
  }

  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new SchemaError('absolute paths are not allowed', path);
  }

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new SchemaError('path traversal segments are not allowed', path);
  }

  return normalized;
}

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
  return brandString<'SnapshotTemplateId'>(ensureSafeRelativePathLike(value, 'snapshot_template'));
}

export function createWidgetId(value: string): WidgetId {
  return brandString<'WidgetId'>(value);
}

