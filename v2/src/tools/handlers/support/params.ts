/**
 * "@param" references in tool values. An ADO step says "Enter @policyNumber
 * in search field"; the agent passes value "@policyNumber" plus
 * params { policyNumber: "POL-001" }, so the literal (and any secret) lives
 * in params, which receipts never record. The pattern matches emission's:
 * an "@" after a letter, digit, "_", "@" or "." (an email address) is text.
 */
import { ToolError } from '../../../core/errors.js';

const PARAM_IN_TEXT = /(^|[^A-Za-z0-9_@.])@([A-Za-z_][A-Za-z0-9_]*)/g;

export type Params = Readonly<Record<string, string>>;

/** Parameter names referenced as "@name" in a text, in order, deduplicated. */
export const paramNamesIn = (text: string): readonly string[] =>
  [...new Set([...text.matchAll(PARAM_IN_TEXT)].map((match) => match[2]!))];

/** The value for a parameter name: exact key first, then case-insensitive (ADO parameter names are). */
export const lookupParam = (name: string, params: Params | undefined): string | undefined => {
  if (params === undefined) return undefined;
  if (Object.prototype.hasOwnProperty.call(params, name)) return params[name];
  const key = Object.keys(params).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : params[key];
};

export interface Substituted {
  readonly text: string;
  /** True when at least one "@name" was replaced from params. */
  readonly used: boolean;
}

/**
 * Replace every "@name" with params[name]. A reference with no value is the
 * caller's mistake: invalid-input, naming the parameter.
 */
export const substituteAtParams = (text: string, params: Params | undefined, field = 'value'): Substituted => {
  let used = false;
  const replaced = text.replace(PARAM_IN_TEXT, (_match, lead: string, name: string) => {
    const value = lookupParam(name, params);
    if (value === undefined) {
      throw new ToolError(
        'invalid-input',
        `${field} references @${name} but params has no "${name}"; pass params: { "${name}": "…" } (secrets belong in params, never in the value)`,
        { parameter: name, field },
      );
    }
    used = true;
    return `${lead}${value}`;
  });
  return { text: replaced, used };
};

/** The values of the parameters a text references (the ones substituteAtParams puts in); unknown names are skipped. */
export const paramValuesIn = (text: string | number | undefined, params: Params | undefined): readonly string[] =>
  typeof text !== 'string'
    ? []
    : paramNamesIn(text).flatMap((name) => {
        const value = lookupParam(name, params);
        return value === undefined || value.length === 0 ? [] : [value];
      });

export const SECRET_MARK = '<secret>';

/** Below this length a value is replaced only where it is the whole text (masking every "a" would say nothing). */
const MIN_MASKED_FRAGMENT = 3;

/**
 * Replace every occurrence of each secret in `text` with "<secret>", also in
 * the escaped form a quoted message carries ("a\"b"). A text that is
 * exactly a secret becomes "<secret>" whatever its length.
 */
export const maskSecrets = (text: string, secrets: readonly string[]): string => {
  const usable = [...new Set(secrets.filter((secret) => secret.length > 0))];
  if (usable.length === 0) return text;
  if (usable.includes(text)) return SECRET_MARK;
  const forms = usable
    .filter((secret) => secret.length >= MIN_MASKED_FRAGMENT)
    .flatMap((secret) => [secret, JSON.stringify(secret).slice(1, -1)])
    .sort((a, b) => b.length - a.length);
  return forms.reduce((acc, form) => acc.split(form).join(SECRET_MARK), text);
};

/** substituteAtParams for an optional value; numbers pass through untouched. */
export const substituteOptional = <V extends string | number | undefined>(
  value: V,
  params: Params | undefined,
  field = 'value',
): { readonly value: V; readonly used: boolean } => {
  if (typeof value !== 'string') return { value, used: false };
  const { text, used } = substituteAtParams(value, params, field);
  return { value: text as V, used };
};
