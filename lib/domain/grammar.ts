import type { ElementId, ScreenId, SurfaceId } from './identity';
import { createSurfaceId } from './identity';
import { unknownWidgetActionError } from './errors';
import type { CapabilityName, DerivedCapability, ElementSig, ScreenElements, SurfaceGraph, WidgetAction } from './types';
import { graphIds, knowledgePaths } from './ids';
import { widgetCapabilityContracts } from './widgets/contracts';
import { compareStrings, uniqueSorted } from './collections';

const roleCapabilities: Record<string, CapabilityName[]> = {
  alert: ['observe-state'],
  button: ['invoke', 'observe-state'],
  combobox: ['enter', 'observe-state'],
  dialog: ['observe-state'],
  region: ['observe-state'],
  table: ['observe-structure', 'observe-state'],
  textbox: ['enter', 'observe-state'],
};

function capabilitiesFromWidgetAction(widget: string, action: WidgetAction): CapabilityName[] {
  switch (action) {
    case 'click':
      return ['invoke'];
    case 'fill':
    case 'clear':
      return ['enter'];
    case 'get-value':
      return ['observe-state'];
    default:
      throw unknownWidgetActionError(widget, action);
  }
}

function capabilitiesForElement(element: ElementSig): CapabilityName[] {
  const contract = widgetCapabilityContracts[element.widget];
  const contractOperations = contract
    ? contract.supportedActions.flatMap((action) => capabilitiesFromWidgetAction(contract.widget, action))
    : [];
  return uniqueSorted([...contractOperations, ...(roleCapabilities[element.role] ?? [])]);
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
    .sort((left, right) => compareStrings(left.id, right.id));
}

export function findCapability(
  capabilities: DerivedCapability[],
  targetKind: DerivedCapability['targetKind'],
  target: ScreenId | SurfaceId | ElementId,
): DerivedCapability | undefined {
  return capabilities.find((entry) => entry.targetKind === targetKind && entry.target === target);
}
