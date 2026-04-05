import type { ElementId } from '../kernel/identity';
import type { StepAction } from '../governance/workflow-types';

/**
 * Derive a POM-style method name from a grounded step's action, element, and intent.
 *
 * Rules:
 * - navigate → "navigate"
 * - input + elementId → "enter" + cleaned element name (strip Input/Field suffix)
 * - click + elementId → "click" + cleaned element name (strip Button/Link suffix)
 * - assert-snapshot + elementId → "expect" + cleaned element name + "Visible"
 * - custom or no element → camelCase from intent
 *
 * Pure function — deterministic for the same inputs.
 */
export function deriveMethodName(
  action: StepAction,
  elementId: ElementId | null,
  intent: string,
): string {
  switch (action) {
    case 'navigate':
      return 'navigate';
    case 'input':
      return elementId
        ? `enter${capitalize(toCamelCase(stripSuffixes(elementId, ['Input', 'Field'])))}`
        : camelCaseFromIntent(intent, 'enter');
    case 'click':
      return elementId
        ? `click${capitalize(toCamelCase(stripSuffixes(elementId, ['Button', 'Link', 'Btn'])))}`
        : camelCaseFromIntent(intent, 'click');
    case 'assert-snapshot':
      return elementId
        ? `expect${capitalize(toCamelCase(stripSuffixes(elementId, ['Table', 'Grid', 'Panel', 'List'])))}Visible`
        : camelCaseFromIntent(intent, 'expect');
    case 'custom':
      return camelCaseFromIntent(intent, 'execute');
  }
}

/**
 * Deduplicate method names within a screen by appending step index when collisions occur.
 * Returns a new array with the same length as the input.
 *
 * Two-pass fold: first pass counts occurrences, second pass resolves names.
 */
export function deduplicateMethodNames(
  methods: ReadonlyArray<{ readonly methodName: string; readonly stepIndex: number }>,
): ReadonlyArray<string> {
  const counts: ReadonlyMap<string, number> = methods.reduce(
    (acc, m) => new Map([...acc, [m.methodName, (acc.get(m.methodName) ?? 0) + 1]]),
    new Map<string, number>(),
  );

  return methods.reduce<{ readonly names: ReadonlyArray<string>; readonly seen: ReadonlyMap<string, number> }>(
    (acc, m) => {
      const count = counts.get(m.methodName) ?? 1;
      if (count === 1) {
        return { names: [...acc.names, m.methodName], seen: acc.seen };
      }
      const occurrence = (acc.seen.get(m.methodName) ?? 0) + 1;
      const name = occurrence === 1 ? m.methodName : `${m.methodName}${m.stepIndex}`;
      return {
        names: [...acc.names, name],
        seen: new Map([...acc.seen, [m.methodName, occurrence]]),
      };
    },
    { names: [], seen: new Map() },
  ).names;
}

function toCamelCase(s: string): string {
  return s.replace(/[-_]([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function stripSuffixes(id: string, suffixes: ReadonlyArray<string>): string {
  const match = suffixes.find((suffix) => id.endsWith(suffix) && id.length > suffix.length);
  return match ? id.slice(0, -match.length) : id;
}

function camelCaseFromIntent(intent: string, prefix: string): string {
  const words = intent
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 5);

  if (words.length === 0) return prefix;

  const camelWords = words.map((w, i) =>
    i === 0 ? w.toLowerCase() : capitalize(w.toLowerCase()),
  );

  const name = `${prefix}${capitalize(camelWords.join(''))}`;
  return name.length > 40 ? name.slice(0, 40) : name;
}
