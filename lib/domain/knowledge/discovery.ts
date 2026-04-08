import { computeNormalizedSnapshotHash, normalizeAriaSnapshot } from '../kernel/hash';
import type { AssertionKind, SurfaceKind } from '../governance/workflow-types';
import { uniqueSorted } from '../kernel/collections';
import {
  deriveRoleFromSignature,
  supportedStepActionsForRole,
  widgetForRole as widgetForRoleBridge,
} from '../widgets/role-affordances';

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
    .flatMap((part) => {
      const trimmed = part.trim();
      return trimmed.length > 0 ? [trimmed] : [];
    });

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

function ensureUniqueId(base: string, seen: ReadonlySet<string>): readonly [string, ReadonlySet<string>] {
  const candidate = base || 'discoveredItem';
  const findUnique = (name: string, suffix: number): string =>
    seen.has(name) ? findUnique(`${candidate}${suffix}`, suffix + 1) : name;
  const result = findUnique(candidate, 2);
  return [result, new Set([...seen, result])];
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
  // Use deriveRoleFromSignature for input type refinement
  const derivedRole = deriveRoleFromSignature({ role, ...(inputType != null ? { inputType } : {}) });
  const resolved = derivedRole ?? role;
  return widgetForRoleBridge(resolved);
}

function supportedActionsForRole(role: string, widget: string): ('click' | 'input' | 'assert-snapshot')[] {
  const supported = supportedStepActionsForRole(role);
  if (supported.length > 0) return [...supported];
  // Fallback: check widget for backward compat
  if (widget === 'os-button') return ['click'];
  if (widget === 'os-input' || widget === 'os-select' || widget === 'os-checkbox' || widget === 'os-radio') return ['input'];
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
  return [
    ...(input.testId ? [{ kind: 'test-id' as const, value: input.testId }] : []),
    { kind: 'role-name' as const, role: input.role, name: input.name },
    ...(!input.testId ? [{ kind: 'css' as const, value: input.selector }] : []),
  ];
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
  const initialSurfaceIds: ReadonlySet<string> = new Set();
  const sortedSurfaces = sortSurfaces(input.surfaces);
  const normalizedSurfaces: readonly RawDiscoveredSurface[] = sortedSurfaces.length === 0
    ? [{
        selector: input.rootSelector,
        parentSelector: null,
        role: 'main',
        name: input.title,
        testId: null,
        idAttribute: null,
        contract: null,
        tagName: 'main',
      }]
    : sortedSurfaces;
  const surfaceSelectors = new Set(normalizedSurfaces.map((surface) => surface.selector));
  const normalizedElements = sortElements(input.elements.filter((element) => !surfaceSelectors.has(element.selector)));

  // Pure functional reduce over surfaces. The `idsBySelector` map is a
  // const local that we mutate via `.set()` (legal — no reassignment),
  // and `seenSurfaceIds` is threaded through the reduce's accumulator
  // so there is never a `let` reassignment in domain code.
  const { surfaceIdsBySelector, seenSurfaceIds } = ((): {
    surfaceIdsBySelector: ReadonlyMap<string, string>;
    seenSurfaceIds: ReadonlySet<string>;
  } => {
    const idsBySelector = new Map<string, string>();
    const finalSeen = normalizedSurfaces.reduce<ReadonlySet<string>>((seen, surface) => {
      const baseId = createStableBaseId({
        contract: surface.contract,
        testId: surface.testId,
        idAttribute: surface.idAttribute,
        name: surface.name,
        role: surface.role,
        suffix: 'surface',
      });
      const [surfaceId, nextSeen] = ensureUniqueId(baseId, seen);
      idsBySelector.set(surface.selector, surfaceId);
      return nextSeen;
    }, initialSurfaceIds);
    return { surfaceIdsBySelector: idsBySelector, seenSurfaceIds: finalSeen };
  })();

  const rootSurfaceId = normalizedSurfaces
    .flatMap((surface) => surface.parentSelector === null ? [surfaceIdsBySelector.get(surface.selector)] : [])
    .find((value) => value !== undefined)
    ?? normalizedSurfaces
      .map((surface) => surfaceIdsBySelector.get(surface.selector))
      .find((value) => value !== undefined)
    ?? 'pageRoot';
  const surfaceReports: readonly DiscoverySurfaceReport[] = normalizedSurfaces.map((surface) => {
    const surfaceId = surfaceIdsBySelector.get(surface.selector) ?? rootSurfaceId;
    const parentSurfaceId = surface.parentSelector ? (surfaceIdsBySelector.get(surface.parentSelector) ?? null) : null;
    const assertions = surfaceAssertionsForRole(surface.role, surface.tagName);
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

  // Phase 2.4 / T7 Big-O fix: O(N) in-place accumulation.
  const childSurfacesByParent = ((): ReadonlyMap<string, readonly string[]> => {
    const acc = new Map<string, readonly string[]>();
    for (const report of surfaceReports) {
      if (!report.parentSurfaceId) continue;
      const existing = acc.get(report.parentSurfaceId) ?? [];
      acc.set(report.parentSurfaceId, [...existing, report.id]);
    }
    return acc;
  })();

  // Phase 2.4 / T7 Big-O fix: single-pass over elements. Was O(N²)
  // Pure reduce: seenIds is threaded through the accumulator so there
  // is never a `let` reassignment. `reports` and `bySurface` are const
  // locals we mutate via push/set (legal — no reassignment).
  const { elementReports, elementsBySurface } = ((): {
    elementReports: readonly DiscoveryElementReport[];
    elementsBySurface: ReadonlyMap<string, readonly string[]>;
  } => {
    const reports: DiscoveryElementReport[] = [];
    const bySurface = new Map<string, readonly string[]>();
    normalizedElements.reduce<ReadonlySet<string>>((seenIds, element) => {
      const role = element.role ?? 'region';
      const widget = widgetForRole(role, element.inputType);
      const [elementId, nextSeen] = ensureUniqueId(createStableBaseId({
        contract: element.contract,
        testId: element.testId,
        idAttribute: element.idAttribute,
        name: element.name,
        role,
        suffix: 'element',
      }), seenIds);
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
      const report: DiscoveryElementReport = {
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
      reports.push(report);
      const existing = bySurface.get(surfaceId) ?? [];
      bySurface.set(surfaceId, [...existing, elementId]);
      return nextSeen;
    }, seenSurfaceIds);
    return { elementReports: reports, elementsBySurface: bySurface };
  })();

  const surfaceNotes: DiscoveryReviewNote[] = surfaceReports
    .flatMap((surface) => !surface.name && !surface.testId ? [{
      code: 'missing-accessible-name' as const,
      message: `Surface ${surface.id} has no accessible name or test id; review selector quality before promotion.`,
      targetId: surface.id,
      targetKind: 'surface' as const,
    }] : []);

  const elementNotes: DiscoveryReviewNote[] = elementReports.flatMap((element) => [
    ...(!element.name && !element.testId
      ? [{
          code: 'missing-accessible-name' as const,
          message: `Element ${element.id} has no accessible name or test id; another agent should review the proposed selector.`,
          targetId: element.id,
          targetKind: 'element' as const,
        }]
      : []),
    ...(element.locatorHint === 'css'
      ? [{
          code: 'css-fallback-only' as const,
          message: `Element ${element.id} relies on a css fallback only; promote a more stable locator if available.`,
          targetId: element.id,
          targetKind: 'element' as const,
        }]
      : []),
  ]);

  const clickExplorationNote: DiscoveryReviewNote[] = elementReports.some((element) => element.supportedActions.includes('click'))
    ? [{
        code: 'state-exploration-recommended' as const,
        message: `Discovered state exposes click-capable controls; capture additional seeded states before promoting canonical knowledge for ${input.screen}.`,
        targetId: rootSurfaceId,
        targetKind: 'surface' as const,
      }]
    : [];

  const notes: ReadonlyArray<DiscoveryReviewNote> = [...surfaceNotes, ...elementNotes, ...clickExplorationNote];

  const topLevelSurfaceIds = surfaceReports
    .flatMap((surface) => surface.parentSurfaceId === null ? [surface.id] : []);

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
  // Pure memoization cache — depthForSurface computes a deterministic result
  // from the immutable surfaceById map. Cache mutation is confined to this closure.
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
    const traverse = (frontier: ReadonlyArray<string>, seen: Set<string>, result: ReadonlyArray<string>): ReadonlyArray<string> => {
      if (frontier.length === 0) {
        return result;
      }
      const [current, ...rest] = frontier;
      if (!current || seen.has(current)) {
        return traverse(rest, seen, result);
      }
      const children = uniqueSorted(childSurfacesByParent.get(current) ?? []);
      return traverse([...rest, ...children], new Set([...seen, current]), [...result, current]);
    };
    return [...traverse([rootId], new Set(), [])];
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
      surfaces: surfaceReports as DiscoverySurfaceReport[],
      elements: elementReports as DiscoveryElementReport[],
      reviewNotes: [...notes].sort((left, right) => `${left.targetKind}:${left.targetId}:${left.code}`.localeCompare(`${right.targetKind}:${right.targetId}:${right.code}`)),
    },
    surfaceScaffold,
    elementsScaffold,
    sectionArtifacts,
  };
}

export function deriveScreenIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0);
    const fromPath = slugify(segments.at(-1) ?? '');
    if (fromPath.length > 0) {
      return fromPath.replace(/-html$/, '');
    }
  } catch {
    return 'discovered-screen';
  }
  return 'discovered-screen';
}
