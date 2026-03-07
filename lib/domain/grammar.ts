import { createElementId, createSurfaceId, ElementId, ScreenId, SurfaceId } from './identity';
import { CapabilityName, DerivedCapability, ElementSig, ScreenElements, SurfaceGraph } from './types';
import { graphIds, knowledgePaths } from './ids';

const widgetCapabilities: Record<string, CapabilityName[]> = {
  'os-button': ['invoke', 'observe-state'],
  'os-input': ['enter', 'observe-state'],
  'os-region': ['observe-state'],
  'os-table': ['observe-structure', 'observe-state'],
};

const roleCapabilities: Record<string, CapabilityName[]> = {
  alert: ['observe-state'],
  button: ['invoke', 'observe-state'],
  combobox: ['enter', 'observe-state'],
  dialog: ['observe-state'],
  region: ['observe-state'],
  table: ['observe-structure', 'observe-state'],
  textbox: ['enter', 'observe-state'],
};

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)) as T[];
}

function capabilitiesForElement(element: ElementSig): CapabilityName[] {
  return uniqueSorted([...(widgetCapabilities[element.widget] ?? []), ...(roleCapabilities[element.role] ?? [])]);
}

function surfaceOperations(
  surfaceId: SurfaceId,
  surfaceGraph: SurfaceGraph,
  elements: ScreenElements['elements'],
  seen: Set<SurfaceId>,
): CapabilityName[] {
  if (seen.has(surfaceId)) {
    return [];
  }

  seen.add(surfaceId);
  const surface = surfaceGraph.surfaces[surfaceId];
  if (!surface) {
    return [];
  }

  const operations: CapabilityName[] = [];
  if (surface.assertions.includes('state')) {
    operations.push('observe-state');
  }
  if (surface.assertions.includes('structure')) {
    operations.push('observe-structure');
  }

  for (const elementId of surface.elements) {
    const element = elements[elementId];
    if (element) {
      operations.push(...capabilitiesForElement(element));
    }
  }

  for (const child of surface.children) {
    operations.push(...surfaceOperations(child, surfaceGraph, elements, seen));
  }

  return uniqueSorted(operations);
}

export function deriveCapabilities(surfaceGraph: SurfaceGraph, screenElements: ScreenElements): DerivedCapability[] {
  const screenId = surfaceGraph.screen;
  const capabilities: DerivedCapability[] = [
    {
      id: graphIds.capability.screen(screenId),
      targetKind: 'screen',
      target: screenId,
      operations: ['navigate'],
      provenance: {
        knowledgePath: knowledgePaths.surface(screenId),
      },
    },
  ];

  for (const [surfaceKey, surface] of Object.entries(surfaceGraph.surfaces)) {
    const surfaceId = createSurfaceId(surfaceKey);
    capabilities.push({
      id: graphIds.capability.surface(screenId, surfaceId),
      targetKind: 'surface',
      target: surfaceId,
      operations: surfaceOperations(surfaceId, surfaceGraph, screenElements.elements, new Set<SurfaceId>()),
      provenance: {
        knowledgePath: knowledgePaths.surface(screenId),
      },
    });

    for (const elementId of surface.elements) {
      const element = screenElements.elements[elementId];
      if (!element) {
        continue;
      }

      capabilities.push({
        id: graphIds.capability.element(screenId, elementId),
        targetKind: 'element',
        target: elementId,
        operations: capabilitiesForElement(element),
        provenance: {
          knowledgePath: knowledgePaths.elements(screenId),
        },
      });
    }
  }

  return capabilities
    .map((entry) => ({
      ...entry,
      operations: uniqueSorted(entry.operations),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function findCapability(
  capabilities: DerivedCapability[],
  targetKind: DerivedCapability['targetKind'],
  target: ScreenId | SurfaceId | ElementId,
): DerivedCapability | undefined {
  return capabilities.find((entry) => entry.targetKind === targetKind && entry.target === target);
}

