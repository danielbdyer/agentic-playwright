import YAML from 'yaml';
import { Effect } from 'effect';
import { isRecord } from '../domain/collections';
import { FileSystem } from './ports';
import type { ProjectPaths } from './paths';

export interface DriftTarget {
  readonly screen: string;
  readonly element?: string;
}

export interface FieldReplaceMutation {
  readonly field: string;
  readonly from: string;
  readonly to: string;
}

export interface ElementAdditionMutation {
  readonly elementId: string;
  readonly definition: Record<string, unknown>;
}

export interface AliasRemovalMutation {
  readonly removedAliases: readonly string[];
}

export interface DriftEvent {
  readonly id: string;
  readonly type: 'label-change' | 'locator-degradation' | 'element-addition' | 'alias-removal';
  readonly target: DriftTarget;
  readonly mutation: FieldReplaceMutation | ElementAdditionMutation | AliasRemovalMutation;
}

export interface VarianceManifest {
  readonly kind: 'variance-manifest';
  readonly version: 1;
  readonly description: string;
  readonly screen: string;
  readonly 'drift-events': readonly DriftEvent[];
}

export interface DriftApplyResult {
  readonly appliedEventIds: readonly string[];
  readonly modifiedFiles: readonly string[];
}

function replaceElementField(
  elements: Record<string, unknown>,
  element: string,
  mutation: FieldReplaceMutation,
): Record<string, unknown> {
  const entry = isRecord(elements[element]) ? { ...elements[element] as Record<string, unknown> } : {};
  return entry[mutation.field] === mutation.from
    ? { ...elements, [element]: { ...entry, [mutation.field]: mutation.to } }
    : elements;
}

function addElement(
  elements: Record<string, unknown>,
  mutation: ElementAdditionMutation,
): Record<string, unknown> {
  return elements[mutation.elementId] !== undefined
    ? elements
    : { ...elements, [mutation.elementId]: mutation.definition };
}

function removeAliases(
  hintsElements: Record<string, unknown>,
  element: string,
  mutation: AliasRemovalMutation,
): Record<string, unknown> {
  const entry = isRecord(hintsElements[element]) ? { ...hintsElements[element] as Record<string, unknown> } : {};
  const aliases = Array.isArray(entry.aliases) ? entry.aliases as string[] : [];
  const filtered = aliases.filter((a) => !mutation.removedAliases.includes(a));
  return filtered.length === aliases.length
    ? hintsElements
    : { ...hintsElements, [element]: { ...entry, aliases: filtered } };
}

function applyDriftToElements(
  doc: Record<string, unknown>,
  event: DriftEvent,
): Record<string, unknown> {
  const elements = isRecord(doc.elements) ? { ...doc.elements as Record<string, unknown> } : {};

  switch (event.type) {
    case 'label-change':
    case 'locator-degradation':
      return {
        ...doc,
        elements: replaceElementField(elements, event.target.element!, event.mutation as FieldReplaceMutation),
      };
    case 'element-addition':
      return {
        ...doc,
        elements: addElement(elements, event.mutation as ElementAdditionMutation),
      };
    default:
      return doc;
  }
}

function applyDriftToHints(
  doc: Record<string, unknown>,
  event: DriftEvent,
): Record<string, unknown> {
  if (event.type !== 'alias-removal') {
    return doc;
  }
  const elements = isRecord(doc.elements) ? { ...doc.elements as Record<string, unknown> } : {};
  return {
    ...doc,
    elements: removeAliases(elements, event.target.element!, event.mutation as AliasRemovalMutation),
  };
}

function collectModifiedFile(
  path: string,
  initial: Record<string, unknown>,
  final: Record<string, unknown>,
): readonly string[] {
  return YAML.stringify(final) !== YAML.stringify(initial) ? [path] : [];
}

export function loadVarianceManifest(manifestPath: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const text = yield* fs.readText(manifestPath);
    return YAML.parse(text) as VarianceManifest;
  });
}

export function applyDriftEvents(options: {
  readonly paths: ProjectPaths;
  readonly manifest: VarianceManifest;
  readonly eventIds?: readonly string[];
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const { manifest, paths, eventIds } = options;
    const events = eventIds
      ? manifest['drift-events'].filter((e) => eventIds.includes(e.id))
      : manifest['drift-events'];

    const elementsPath = `${paths.rootDir}/knowledge/screens/${manifest.screen}.elements.yaml`;
    const hintsPath = `${paths.rootDir}/knowledge/screens/${manifest.screen}.hints.yaml`;

    const { elementsText, hintsText } = yield* Effect.all({
      elementsText: fs.readText(elementsPath),
      hintsText: fs.readText(hintsPath),
    });

    const initialElements = YAML.parse(elementsText) as Record<string, unknown>;
    const initialHints = YAML.parse(hintsText) as Record<string, unknown>;

    const elementEvents = events.filter((e) =>
      e.type === 'label-change' || e.type === 'locator-degradation' || e.type === 'element-addition',
    );
    const hintEvents = events.filter((e) => e.type === 'alias-removal');

    const finalElements = elementEvents.reduce(
      (doc, event) => applyDriftToElements(doc, event),
      initialElements,
    );

    const finalHints = hintEvents.reduce(
      (doc, event) => applyDriftToHints(doc, event),
      initialHints,
    );

    const modifiedFiles = [
      ...collectModifiedFile(elementsPath, initialElements, finalElements),
      ...collectModifiedFile(hintsPath, initialHints, finalHints),
    ];

    yield* Effect.all(
      modifiedFiles.map((filePath) => {
        const content = filePath === elementsPath
          ? YAML.stringify(finalElements)
          : YAML.stringify(finalHints);
        return fs.writeText(filePath, content);
      }),
      { concurrency: 1 },
    );

    return {
      appliedEventIds: events.map((e) => e.id),
      modifiedFiles,
    } satisfies DriftApplyResult;
  });
}
