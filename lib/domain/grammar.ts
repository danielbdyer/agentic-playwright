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
  seen: ReadonlySet<SurfaceId>,
): CapabilityName[] {
  if (seen.has(surfaceId)) {
    return [];
  }

  const surface = surfaceGraph.surfaces[surfaceId];
  if (!surface) {
    return [];
  }

  const nextSeen = new Set([...seen, surfaceId]);
  const assertionOps: CapabilityName[] = [
    ...(surface.assertions.includes('state') ? ['observe-state' as const] : []),
    ...(surface.assertions.includes('structure') ? ['observe-structure' as const] : []),
  ];
  const elementOps = surface.elements.flatMap((elementId) => {
    const element = elements[elementId];
    return element ? capabilitiesForElement(element) : [];
  });
  const childOps = surface.children.flatMap((child) =>
    surfaceOperations(child, surfaceGraph, elements, nextSeen),
  );

  return uniqueSorted([...assertionOps, ...elementOps, ...childOps]);
}

export function deriveCapabilities(surfaceGraph: SurfaceGraph, screenElements: ScreenElements): DerivedCapability[] {
  const screenId = surfaceGraph.screen;

  const screenCapability: DerivedCapability = {
    id: graphIds.capability.screen(screenId),
    targetKind: 'screen',
    target: screenId,
    operations: ['navigate'],
    provenance: { knowledgePath: knowledgePaths.surface(screenId) },
  };

  const surfaceAndElementCapabilities = Object.entries(surfaceGraph.surfaces).flatMap(([surfaceKey, surface]) => {
    const surfaceId = createSurfaceId(surfaceKey);
    const surfaceCapability: DerivedCapability = {
      id: graphIds.capability.surface(screenId, surfaceId),
      targetKind: 'surface',
      target: surfaceId,
      operations: surfaceOperations(surfaceId, surfaceGraph, screenElements.elements, new Set<SurfaceId>()),
      provenance: { knowledgePath: knowledgePaths.surface(screenId) },
    };
    const elementCapabilities: DerivedCapability[] = surface.elements.flatMap((elementId) => {
      const element = screenElements.elements[elementId];
      return element
        ? [{
            id: graphIds.capability.element(screenId, elementId),
            targetKind: 'element' as const,
            target: elementId,
            operations: capabilitiesForElement(element),
            provenance: { knowledgePath: knowledgePaths.elements(screenId) },
          }]
        : [];
    });
    return [surfaceCapability, ...elementCapabilities];
  });

  return [screenCapability, ...surfaceAndElementCapabilities]
    .map((entry) => ({ ...entry, operations: uniqueSorted(entry.operations) }))
    .sort((left, right) => compareStrings(left.id, right.id));
}

export function findCapability(
  capabilities: DerivedCapability[],
  targetKind: DerivedCapability['targetKind'],
  target: ScreenId | SurfaceId | ElementId,
): DerivedCapability | undefined {
  return capabilities.find((entry) => entry.targetKind === targetKind && entry.target === target);
}
