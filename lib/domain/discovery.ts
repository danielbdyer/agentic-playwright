import { computeNormalizedSnapshotHash, normalizeAriaSnapshot } from './hash';
import type { AssertionKind, SurfaceKind } from './types';

export interface RawDiscoveredSurface {
  selector: string;
  parentSelector: string | null;
  role: string | null;
  name: string | null;
  testId: string | null;
  idAttribute: string | null;
  contract: string | null;
  tagName: string;
}

export interface RawDiscoveredElement {
  selector: string;
  surfaceSelector: string | null;
  role: string | null;
  name: string | null;
  testId: string | null;
  idAttribute: string | null;
  contract: string | null;
  tagName: string;
  inputType: string | null;
  required: boolean;
}

export interface DiscoveryInput {
  screen: string;
  url: string;
  title: string;
  rootSelector: string;
  rootSnapshot: string;
  surfaces: readonly RawDiscoveredSurface[];
  elements: readonly RawDiscoveredElement[];
}

interface DiscoverySurfaceReport {
  id: string;
  selector: string;
  role: string | null;
  name: string | null;
  parentSurfaceId: string | null;
  testId: string | null;
  kindSuggestion: SurfaceKind;
  assertions: AssertionKind[];
}

interface DiscoveryElementReport {
  id: string;
  selector: string;
  surfaceId: string;
  role: string;
  name: string | null;
  testId: string | null;
  widgetSuggestion: string;
  locatorHint: 'test-id' | 'role-name' | 'css';
  locatorCandidates: Array<
    | { kind: 'test-id'; value: string }
    | { kind: 'role-name'; role: string; name: string | null }
    | { kind: 'css'; value: string }
  >;
  supportedActions: ('click' | 'input' | 'assert-snapshot')[];
  required: boolean;
}

export interface DiscoveryReviewNote {
  code: 'missing-accessible-name' | 'css-fallback-only' | 'state-exploration-recommended';
  message: string;
  targetId: string;
  targetKind: 'surface' | 'element';
}

export interface DiscoverySectionArtifact {
  id: string;
  selector: string;
  depth: number;
  surfaceIds: string[];
  elementIds: string[];
  surfaceScaffold: {
    screen: string;
    url: string;
    sections: Record<string, {
      selector: string;
      kind: SurfaceKind;
      surfaces: string[];
      snapshot: null;
    }>;
    surfaces: Record<string, {
      kind: SurfaceKind;
      section: string;
      selector: string;
      parents: string[];
      children: string[];
      elements: string[];
      assertions: AssertionKind[];
      required: boolean;
    }>;
  };
  elementsScaffold: {
    screen: string;
    url: string;
    elements: Record<string, {
      role: string;
      name: string | null;
      testId: string | null;
      cssFallback: string | null;
      locator: Array<
        | { kind: 'test-id'; value: string }
        | { kind: 'role-name'; role: string; name: string | null }
        | { kind: 'css'; value: string }
      >;
      surface: string;
      widget: string;
      required: boolean;
    }>;
  };
}

export interface DiscoveryArtifacts {
  snapshot: string;
  snapshotHash: string;
  report: {
    version: 1;
    screen: string;
    url: string;
    title: string;
    rootSelector: string;
    snapshotHash: string;
    surfaces: DiscoverySurfaceReport[];
    elements: DiscoveryElementReport[];
    reviewNotes: DiscoveryReviewNote[];
  };
  surfaceScaffold: {
    screen: string;
    url: string;
    sections: Record<string, {
      selector: string;
      kind: SurfaceKind;
      surfaces: string[];
      snapshot: null;
    }>;
    surfaces: Record<string, {
      kind: SurfaceKind;
      section: string;
      selector: string;
      parents: string[];
      children: string[];
      elements: string[];
      assertions: AssertionKind[];
      required: boolean;
    }>;
  };
  elementsScaffold: {
    screen: string;
    url: string;
    elements: Record<string, {
      role: string;
      name: string | null;
      testId: string | null;
      cssFallback: string | null;
      locator: Array<
        | { kind: 'test-id'; value: string }
        | { kind: 'role-name'; role: string; name: string | null }
        | { kind: 'css'; value: string }
      >;
      surface: string;
      widget: string;
      required: boolean;
    }>;
  };
  sectionArtifacts: Record<string, DiscoverySectionArtifact>;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function camelize(value: string): string {
  const parts = value
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return 'discoveredItem';
  }

  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      return index === 0 ? lower : `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join('');
}

function ensureUniqueId(base: string, seen: Set<string>): string {
  let next = base || 'discoveredItem';
  let suffix = 2;
  while (seen.has(next)) {
    next = `${base}${suffix}`;
    suffix += 1;
  }
  seen.add(next);
  return next;
}

function surfaceKindForRole(role: string | null, tagName: string): SurfaceKind {
  const normalizedTag = tagName.toLowerCase();
  if (role === 'dialog') return 'modal';
  if (role === 'alert' || role === 'status') return 'validation-region';
  if (role === 'table' || role === 'grid' || normalizedTag === 'table') return 'result-set';
  if (role === 'form' || role === 'search' || normalizedTag === 'form') return 'form';
  return 'section-root';
}

function surfaceAssertionsForRole(role: string | null, tagName: string): AssertionKind[] {
  const normalizedTag = tagName.toLowerCase();
  if (role === 'table' || role === 'grid' || normalizedTag === 'table') {
    return ['state', 'structure'];
  }
  return ['state'];
}

function widgetForRole(role: string, inputType: string | null): string {
  if (role === 'button' || role === 'link') {
    return 'os-button';
  }
  if (role === 'table' || role === 'grid') {
    return 'os-table';
  }
  if (
    role === 'textbox'
    || role === 'searchbox'
    || role === 'combobox'
    || role === 'checkbox'
    || role === 'radio'
    || role === 'switch'
    || inputType === 'text'
    || inputType === 'search'
    || inputType === 'date'
  ) {
    return 'os-input';
  }
  return 'os-region';
}

function supportedActionsForRole(role: string, widget: string): ('click' | 'input' | 'assert-snapshot')[] {
  if (widget === 'os-button' || role === 'button' || role === 'link') {
    return ['click'];
  }
  if (widget === 'os-input') {
    return ['input'];
  }
  return ['assert-snapshot'];
}

function selectLocatorHint(testId: string | null, name: string | null): DiscoveryElementReport['locatorHint'] {
  if (testId) {
    return 'test-id';
  }
  if (name) {
    return 'role-name';
  }
  return 'css';
}

function locatorCandidatesForElement(input: {
  selector: string;
  role: string;
  name: string | null;
  testId: string | null;
}): DiscoveryElementReport['locatorCandidates'] {
  const candidates: DiscoveryElementReport['locatorCandidates'] = [];
  if (input.testId) {
    candidates.push({ kind: 'test-id', value: input.testId });
  }
  candidates.push({ kind: 'role-name', role: input.role, name: input.name });
  if (!input.testId) {
    candidates.push({ kind: 'css', value: input.selector });
  }
  return candidates;
}

function sortSurfaces(input: readonly RawDiscoveredSurface[]): RawDiscoveredSurface[] {
  return [...input].sort((left, right) => {
    const leftKey = `${left.selector}|${left.contract ?? ''}|${left.testId ?? ''}`;
    const rightKey = `${right.selector}|${right.contract ?? ''}|${right.testId ?? ''}`;
    return leftKey.localeCompare(rightKey);
  });
}

function sortElements(input: readonly RawDiscoveredElement[]): RawDiscoveredElement[] {
  return [...input].sort((left, right) => {
    const leftKey = `${left.selector}|${left.contract ?? ''}|${left.testId ?? ''}`;
    const rightKey = `${right.selector}|${right.contract ?? ''}|${right.testId ?? ''}`;
    return leftKey.localeCompare(rightKey);
  });
}

function sectionIdForSurface(surfaceId: string): string {
  return `${surfaceId}Section`;
}

function createStableBaseId(input: {
  contract: string | null;
  testId: string | null;
  idAttribute: string | null;
  name: string | null;
  role: string | null;
  suffix: string;
}): string {
  if (input.contract) {
    return input.contract;
  }
  if (input.testId) {
    return camelize(input.testId);
  }
  if (input.idAttribute) {
    return camelize(input.idAttribute);
  }
  if (input.name) {
    return camelize(`${input.name}-${input.suffix}`);
  }
  if (input.role) {
    return camelize(`${input.role}-${input.suffix}`);
  }
  return camelize(`discovered-${input.suffix}`);
}

export function buildDiscoveryArtifacts(input: DiscoveryInput): DiscoveryArtifacts {
  const normalizedSnapshot = normalizeAriaSnapshot(input.rootSnapshot);
  const snapshotHash = computeNormalizedSnapshotHash(normalizedSnapshot);
  const sectionId = 'discovered-root';
  const surfaceIdsBySelector = new Map<string, string>();
  const discoveredSurfaceIds = new Set<string>();
  const normalizedSurfaces = sortSurfaces(input.surfaces);
  const surfaceSelectors = new Set(normalizedSurfaces.map((surface) => surface.selector));
  const normalizedElements = sortElements(input.elements.filter((element) => !surfaceSelectors.has(element.selector)));

  if (normalizedSurfaces.length === 0) {
    normalizedSurfaces.push({
      selector: input.rootSelector,
      parentSelector: null,
      role: 'main',
      name: input.title,
      testId: null,
      idAttribute: null,
      contract: null,
      tagName: 'main',
    });
  }

  for (const surface of normalizedSurfaces) {
    const baseId = createStableBaseId({
      contract: surface.contract,
      testId: surface.testId,
      idAttribute: surface.idAttribute,
      name: surface.name,
      role: surface.role,
      suffix: 'surface',
    });
    const surfaceId = ensureUniqueId(baseId, discoveredSurfaceIds);
    surfaceIdsBySelector.set(surface.selector, surfaceId);
  }

  const rootSurfaceId = normalizedSurfaces
    .filter((surface) => surface.parentSelector === null)
    .map((surface) => surfaceIdsBySelector.get(surface.selector))
    .find((value) => value !== undefined)
    ?? normalizedSurfaces
      .map((surface) => surfaceIdsBySelector.get(surface.selector))
      .find((value) => value !== undefined)
    ?? 'pageRoot';
  const discoveredElementIds = new Set<string>();
  const elementsBySurface = new Map<string, string[]>();
  const childSurfacesByParent = new Map<string, string[]>();
  const notes: DiscoveryReviewNote[] = [];

  const surfaceReports: DiscoverySurfaceReport[] = normalizedSurfaces.map((surface) => {
    const surfaceId = surfaceIdsBySelector.get(surface.selector) ?? rootSurfaceId;
    const parentSurfaceId = surface.parentSelector ? (surfaceIdsBySelector.get(surface.parentSelector) ?? null) : null;
    const assertions = surfaceAssertionsForRole(surface.role, surface.tagName);
    if (parentSurfaceId) {
      childSurfacesByParent.set(parentSurfaceId, [...(childSurfacesByParent.get(parentSurfaceId) ?? []), surfaceId]);
    }
    if (!surface.name && !surface.testId) {
      notes.push({
        code: 'missing-accessible-name',
        message: `Surface ${surfaceId} has no accessible name or test id; review selector quality before promotion.`,
        targetId: surfaceId,
        targetKind: 'surface',
      });
    }
    return {
      id: surfaceId,
      selector: surface.selector,
      role: surface.role,
      name: surface.name,
      parentSurfaceId,
      testId: surface.testId,
      kindSuggestion: surfaceKindForRole(surface.role, surface.tagName),
      assertions,
    };
  });

  const elementReports: DiscoveryElementReport[] = normalizedElements.map((element) => {
    const role = element.role ?? 'region';
    const widget = widgetForRole(role, element.inputType);
    const elementId = ensureUniqueId(createStableBaseId({
      contract: element.contract,
      testId: element.testId,
      idAttribute: element.idAttribute,
      name: element.name,
      role,
      suffix: 'element',
    }), discoveredElementIds);
    const surfaceId = element.surfaceSelector
      ? (surfaceIdsBySelector.get(element.surfaceSelector) ?? rootSurfaceId)
      : rootSurfaceId;
    const locatorHint = selectLocatorHint(element.testId, element.name);
    const locatorCandidates = locatorCandidatesForElement({
      selector: element.selector,
      role,
      name: element.name,
      testId: element.testId,
    });
    elementsBySurface.set(surfaceId, [...(elementsBySurface.get(surfaceId) ?? []), elementId]);

    if (!element.name && !element.testId) {
      notes.push({
        code: 'missing-accessible-name',
        message: `Element ${elementId} has no accessible name or test id; another agent should review the proposed selector.`,
        targetId: elementId,
        targetKind: 'element',
      });
    }

    if (locatorHint === 'css') {
      notes.push({
        code: 'css-fallback-only',
        message: `Element ${elementId} relies on a css fallback only; promote a more stable locator if available.`,
        targetId: elementId,
        targetKind: 'element',
      });
    }

    return {
      id: elementId,
      selector: element.selector,
      surfaceId,
      role,
      name: element.name,
      testId: element.testId,
      widgetSuggestion: widget,
      locatorHint,
      locatorCandidates,
      supportedActions: supportedActionsForRole(role, widget),
      required: element.required,
    };
  });

  if (elementReports.some((element) => element.supportedActions.includes('click'))) {
    notes.push({
      code: 'state-exploration-recommended',
      message: `Discovered state exposes click-capable controls; capture additional seeded states before promoting canonical knowledge for ${input.screen}.`,
      targetId: rootSurfaceId,
      targetKind: 'surface',
    });
  }

  const topLevelSurfaceIds = surfaceReports
    .filter((surface) => surface.parentSurfaceId === null)
    .map((surface) => surface.id);

  const surfaceScaffold: DiscoveryArtifacts['surfaceScaffold'] = {
    screen: input.screen,
    url: input.url,
    sections: {
      [sectionId]: {
        selector: input.rootSelector,
        kind: 'screen-root',
        surfaces: topLevelSurfaceIds.length > 0 ? topLevelSurfaceIds : [rootSurfaceId],
        snapshot: null,
      },
    },
    surfaces: Object.fromEntries(surfaceReports.map((surface) => [
      surface.id,
      {
        kind: surface.kindSuggestion,
        section: sectionId,
        selector: surface.selector,
        parents: surface.parentSurfaceId ? [surface.parentSurfaceId] : [],
        children: uniqueSorted(childSurfacesByParent.get(surface.id) ?? []),
        elements: uniqueSorted(elementsBySurface.get(surface.id) ?? []),
        assertions: surface.assertions,
        required: true,
      },
    ])),
  };

  const elementsScaffold: DiscoveryArtifacts['elementsScaffold'] = {
    screen: input.screen,
    url: input.url,
    elements: Object.fromEntries(elementReports.map((element) => [
      element.id,
      {
        role: element.role,
        name: element.name,
        testId: element.testId,
        cssFallback: element.locatorHint === 'css' ? element.selector : null,
        locator: element.locatorCandidates.map((candidate) => {
          if (candidate.kind === 'test-id') {
            return candidate;
          }
          if (candidate.kind === 'role-name') {
            return candidate;
          }
          return candidate;
        }),
        surface: element.surfaceId,
        widget: element.widgetSuggestion,
        required: element.required,
      },
    ])),
  };

  const surfaceById = new Map(surfaceReports.map((surface) => [surface.id, surface] as const));
  const elementById = new Map(elementReports.map((element) => [element.id, element] as const));
  const depthCache = new Map<string, number>();

  function depthForSurface(surfaceId: string): number {
    const cached = depthCache.get(surfaceId);
    if (cached !== undefined) {
      return cached;
    }

    const surface = surfaceById.get(surfaceId);
    if (!surface || !surface.parentSurfaceId) {
      depthCache.set(surfaceId, 0);
      return 0;
    }

    const nextDepth = depthForSurface(surface.parentSurfaceId) + 1;
    depthCache.set(surfaceId, nextDepth);
    return nextDepth;
  }

  function descendantSurfaceIds(rootId: string): string[] {
    const ordered: string[] = [];
    const queue = [rootId];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || seen.has(current)) {
        continue;
      }
      seen.add(current);
      ordered.push(current);
      for (const child of uniqueSorted(childSurfacesByParent.get(current) ?? [])) {
        queue.push(child);
      }
    }

    return ordered;
  }

  function descendantElementIds(rootId: string): string[] {
    const surfaceIds = descendantSurfaceIds(rootId);
    return uniqueSorted(surfaceIds.flatMap((surfaceId) => elementsBySurface.get(surfaceId) ?? []));
  }

  const sectionArtifacts: DiscoveryArtifacts['sectionArtifacts'] = Object.fromEntries(surfaceReports.map((surface) => {
    const sectionSurfaceIds = descendantSurfaceIds(surface.id);
    const sectionElementIds = descendantElementIds(surface.id);
    const sectionName = sectionIdForSurface(surface.id);
    const localSurfaceIds = new Set(sectionSurfaceIds);

    return [surface.id, {
      id: surface.id,
      selector: surface.selector,
      depth: depthForSurface(surface.id),
      surfaceIds: sectionSurfaceIds,
      elementIds: sectionElementIds,
      surfaceScaffold: {
        screen: input.screen,
        url: input.url,
        sections: {
          [sectionName]: {
            selector: surface.selector,
            kind: surface.kindSuggestion,
            surfaces: [surface.id],
            snapshot: null,
          },
        },
        surfaces: Object.fromEntries(sectionSurfaceIds.map((surfaceId) => {
          const sectionSurface = surfaceById.get(surfaceId);
          if (!sectionSurface) {
            throw new Error(`Missing discovered surface ${surfaceId}`);
          }
          return [surfaceId, {
            kind: sectionSurface.kindSuggestion,
            section: sectionName,
            selector: sectionSurface.selector,
            parents: sectionSurface.parentSurfaceId && localSurfaceIds.has(sectionSurface.parentSurfaceId)
              ? [sectionSurface.parentSurfaceId]
              : [],
            children: uniqueSorted((childSurfacesByParent.get(surfaceId) ?? []).filter((childId) => localSurfaceIds.has(childId))),
            elements: uniqueSorted(elementsBySurface.get(surfaceId) ?? []),
            assertions: sectionSurface.assertions,
            required: true,
          }];
        })),
      },
      elementsScaffold: {
        screen: input.screen,
        url: input.url,
        elements: Object.fromEntries(sectionElementIds.map((elementId) => {
          const element = elementById.get(elementId);
          if (!element) {
            throw new Error(`Missing discovered element ${elementId}`);
          }
          return [elementId, {
            role: element.role,
            name: element.name,
            testId: element.testId,
            cssFallback: element.locatorHint === 'css' ? element.selector : null,
            locator: element.locatorCandidates.map((candidate) => candidate),
            surface: element.surfaceId,
            widget: element.widgetSuggestion,
            required: element.required,
          }];
        })),
      },
    } satisfies DiscoverySectionArtifact];
  }));

  return {
    snapshot: normalizedSnapshot,
    snapshotHash,
    report: {
      version: 1,
      screen: input.screen,
      url: input.url,
      title: input.title,
      rootSelector: input.rootSelector,
      snapshotHash,
      surfaces: surfaceReports,
      elements: elementReports,
      reviewNotes: notes.sort((left, right) => `${left.targetKind}:${left.targetId}:${left.code}`.localeCompare(`${right.targetKind}:${right.targetId}:${right.code}`)),
    },
    surfaceScaffold,
    elementsScaffold,
    sectionArtifacts,
  };
}

export function deriveScreenIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const fromPath = slugify(parsed.pathname.split('/').filter((segment) => segment.length > 0).pop() ?? '');
    if (fromPath.length > 0) {
      return fromPath.replace(/-html$/, '');
    }
  } catch {
    return 'discovered-screen';
  }
  return 'discovered-screen';
}
