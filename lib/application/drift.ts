import YAML from 'yaml';
import { Effect } from 'effect';
import { isRecord } from '../domain/collections';
import { FileSystem, KnowledgeRepository } from './ports';
import { elementsPath, hintsPath, type ProjectPaths } from './paths';
import type { ScreenId } from '../domain/identity';

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
    case 'alias-removal':
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
    const knowledgeRepository = yield* KnowledgeRepository;
    const { manifest, paths, eventIds } = options;
    const events = eventIds
      ? manifest['drift-events'].filter((e) => eventIds.includes(e.id))
      : manifest['drift-events'];

    const screen = manifest.screen as ScreenId;
    const elementsFilePath = elementsPath(paths, screen);
    const hintsFilePath = hintsPath(paths, screen);

    const { initialElements, initialHints } = yield* Effect.all({
      initialElements: knowledgeRepository.readScreenElements(screen),
      initialHints: knowledgeRepository.readScreenHints(screen),
    }, { concurrency: 'unbounded' });

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
      ...collectModifiedFile(elementsFilePath, initialElements, finalElements),
      ...collectModifiedFile(hintsFilePath, initialHints, finalHints),
    ];

    yield* Effect.all(
      modifiedFiles.map((filePath) => {
        return filePath === elementsFilePath
          ? knowledgeRepository.writeScreenElements(screen, finalElements)
          : knowledgeRepository.writeScreenHints(screen, finalHints);
      }),
      { concurrency: 'unbounded' },
    );

    return {
      appliedEventIds: events.map((e) => e.id),
      modifiedFiles,
    } satisfies DriftApplyResult;
  });
}
