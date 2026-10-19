/**
 * How the driver names what it mints. Names come from the test author
 * (the step's words), locators from the page (what app.act or app.assert
 * verified). A value that came from the data row is written back as its
 * "{param}" placeholder, so a facet is never named after, or bound to, one
 * row's data. Pure functions.
 */
import type { Candidate, FacetDraft, LocatorSpec, ScreenRoute, Snapshot } from '../contract/schemas.js';
import { normalizeText } from '../core/text.js';
import { facetIdFor, isParamRef, type StepIntent } from '../resolve/index.js';

/** "@policyNumber" → "policyNumber"; anything else → null. */
export const paramName = (value: string | null | undefined): string | null =>
  value !== null && value !== undefined && isParamRef(value) ? value.slice(1) : null;

/** "policyNumber" → "policy number". */
export const paramWords = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();

/** Replace "@param" with the data row's value; values without a reference pass through. */
export const bindValue = (value: string, params: Readonly<Record<string, string>>): string => {
  const name = paramName(value);
  if (name === null) return value;
  return params[name] ?? value;
};

const unique = (values: readonly (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (value === null || value === undefined) return [];
    const clean = normalizeText(value);
    const key = clean.toLowerCase();
    if (clean.length === 0 || seen.has(key) || clean.startsWith('@')) return [];
    seen.add(key);
    return [clean];
  });
};

const capitalize = (text: string): string => (text.length === 0 ? text : `${text[0]!.toUpperCase()}${text.slice(1)}`);

/** The route a screen is reached by: the URL relative to the profile baseURL, without query or hash. */
export const relativeRoute = (url: string, baseURL: string | undefined): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
  const bare = `${parsed.origin}${parsed.pathname}`;
  if (baseURL === undefined) return bare;
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  if (bare.startsWith(base)) return bare.slice(base.length);
  if (`${bare}/` === base) return '';
  return bare;
};

/** A ScreenRoute from the snapshot of a screen, carrying its landmarks so goto() can wait for main. */
export const routeFromSnapshot = (snapshot: Snapshot, baseURL: string | undefined): ScreenRoute => ({
  url: relativeRoute(snapshot.url, baseURL),
  variant: snapshot.variant,
  fingerprint: snapshot.fingerprint.hash,
  title: snapshot.title,
  landmarks: [...snapshot.fingerprint.landmarks],
});

/**
 * Replace the data row's value with its "{param}" placeholder where the
 * locator carries it (a row scope, a row-text value, a name), so the facet
 * selects whichever row the test runs with.
 */
export const parameterizeLocator = (
  locator: LocatorSpec,
  params: Readonly<Record<string, string>>,
  prefer: string | null,
): { readonly locator: LocatorSpec; readonly parameter: string | null } => {
  const names = [...(prefer !== null ? [prefer] : []), ...Object.keys(params).filter((name) => name !== prefer)];
  const match = (text: string | undefined): string | null => {
    if (text === undefined) return null;
    const found = names.find((name) => {
      const value = params[name];
      return value !== undefined && value.length > 0 && normalizeText(text) === normalizeText(value);
    });
    return found ?? null;
  };
  const rowParam = match(locator.scope?.rowText);
  if (rowParam !== null && locator.scope !== undefined) {
    return { locator: { ...locator, scope: { ...locator.scope, rowText: `{${rowParam}}` } }, parameter: rowParam };
  }
  if (locator.strategy === 'row-text') {
    const valueParam = match(locator.value);
    if (valueParam !== null) return { locator: { ...locator, value: `{${valueParam}}` }, parameter: valueParam };
  }
  return { locator, parameter: null };
};

/**
 * The locator for a table row selected by the text it contains: the
 * parameter placeholder when the step names the row by "@param", else the
 * literal cue; scoped by the row's landmark.
 */
export const rowLocator = (candidate: Candidate, rowCue: string | null, params: Readonly<Record<string, string>>): { readonly locator: LocatorSpec; readonly parameter: string | null } | null => {
  const param = paramName(rowCue);
  const value = param !== null ? (params[param] !== undefined ? `{${param}}` : null) : rowCue;
  if (value === null || value.length === 0) return null;
  return {
    locator: {
      strategy: 'row-text',
      value,
      ...(candidate.role !== 'row' ? { role: candidate.role } : {}),
      ...(candidate.landmark !== undefined ? { scope: { landmark: candidate.landmark } } : {}),
    },
    parameter: param,
  };
};

/** The display name: the author's mention of the target ("search field"), else the element's name. */
export const displayNameFor = (intent: StepIntent, candidate: Candidate): string => {
  const fillParam = intent.verb === 'fill' || intent.verb === 'select' ? paramName(intent.value) : null;
  const rowParam = paramName(intent.rowCue);
  const raw = intent.targetMention ?? intent.targetPhrase;
  const mention = raw !== null && !raw.startsWith('@') && raw.length <= 60 ? raw : null;
  if (fillParam !== null && mention !== null) return capitalize(`${paramWords(fillParam)} ${mention}`.trim());
  if (candidate.role === 'row') return capitalize(`${rowParam !== null ? paramWords(rowParam) : (mention ?? 'result')} row`);
  if (mention !== null) {
    return capitalize(candidate.role === 'heading' && !/\b(?:heading|title|header)\b/i.test(mention) ? `${mention} heading` : mention);
  }
  const name = candidate.name.trim();
  return name.length > 0 ? capitalize(name.length > 60 ? `${name.slice(0, 57)}…` : name) : capitalize(candidate.role);
};

/** Aliases: the words the step used for the target, and the parameter it binds. */
export const aliasesFor = (intent: StepIntent, candidate: Candidate, extra: readonly string[] = []): string[] => {
  const param = paramName(intent.value) ?? paramName(intent.rowCue);
  const rowName = candidate.role === 'row' ? null : candidate.name.length <= 60 ? candidate.name : null;
  return unique([intent.targetMention, intent.targetPhrase, param !== null ? paramWords(param) : null, rowName, ...extra]);
};

export interface DraftInput {
  readonly screen: string;
  readonly intent: StepIntent;
  readonly candidate: Candidate;
  readonly locator?: LocatorSpec;
  readonly parameter?: string | null;
  readonly kind?: FacetDraft['kind'];
  readonly name?: string;
  readonly extraAliases?: readonly string[];
}

/** The facet draft memory.mint takes, named from the step and located by the verified locator. */
export const facetDraft = (input: DraftInput): FacetDraft => {
  const { candidate, intent } = input;
  const id = facetIdFor(input.screen, intent, candidate);
  const local = input.name ?? id.slice(id.indexOf(':') + 1);
  const scope = {
    ...(candidate.landmark !== undefined ? { landmark: candidate.landmark } : {}),
    ...(candidate.dataBlock !== undefined ? { dataBlock: candidate.dataBlock } : {}),
  };
  return {
    name: local,
    kind: input.kind ?? (candidate.role === 'row' ? 'row' : 'element'),
    displayName: displayNameFor(intent, candidate),
    aliases: aliasesFor(intent, candidate, input.extraAliases ?? []),
    role: candidate.role,
    tag: candidate.tag,
    namingSource: candidate.namingSource,
    affordance: candidate.affordance,
    ...(Object.keys(scope).length > 0 ? { scope } : {}),
    ...(input.locator !== undefined ? { locator: input.locator } : {}),
    ...(input.parameter !== null && input.parameter !== undefined ? { parameter: input.parameter } : {}),
  };
};

/** The words of a screen named in a step ("Policy Search") as a URL segment the OutSystems way ("PolicySearch"). */
export const screenSegment = (phrase: string): string =>
  normalizeText(phrase)
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word[0]!.toUpperCase()}${word.slice(1)}`)
    .join('');
