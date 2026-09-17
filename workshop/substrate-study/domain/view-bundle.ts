/**
 * Static view-bundle channel (docs/v2-reactive-discovery-handoff.md
 * §3.3 / A10, N6).
 *
 * A Reactive screen's compiled view bundle
 * (`<Module>.<Flow>.<Screen>.mvc.js`, named by the manifest's
 * `viewModuleName`) is public page source. It names the blocks the
 * screen composes and carries the literal strings the designer
 * typed — `prompt:` is OutSystems' word for placeholder. Reading it
 * needs no rendering: zero hydration risk, zero PII exposure (sample
 * data comes from the database at runtime, not from the bundle).
 *
 * `extractViewBundleFacts` is the pure reader; the harvest script
 * fetches the bundle and calls it. The N6 law: literals found
 * statically are a subset of the names found by rendering the same
 * route — checked by the script against a SnapshotRecord, and by a
 * unit law against a synthetic bundle.
 */

export interface ViewBundleFacts {
  /** `prompt: "…"` literals — placeholders. */
  readonly prompts: readonly string[];
  /** Every distinct `<Module>.<Folder>.<Block>` reference. */
  readonly blockRefs: readonly string[];
  readonly onClickCount: number;
  readonly createElementCount: number;
  readonly bytes: number;
}

const PROMPT_RE = /\bprompt:\s*"((?:[^"\\]|\\.)*)"/g;
const BLOCK_REF_RE = /\b([A-Z][A-Za-z0-9_]*)\.([A-Z][A-Za-z0-9_]*)\.([A-Z][A-Za-z0-9_$]*)\b(?=\.mvc\$view|\.mvc\$|["'])/g;

function distinctSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

export function extractViewBundleFacts(source: string): ViewBundleFacts {
  const prompts = distinctSorted([...source.matchAll(PROMPT_RE)].map((m) => m[1]!.replace(/\\(.)/g, '$1')));
  const blockRefs = distinctSorted([...source.matchAll(BLOCK_REF_RE)].map((m) => `${m[1]}.${m[2]}.${m[3]}`));
  return {
    prompts,
    blockRefs,
    onClickCount: (source.match(/\bonClick\b/g) ?? []).length,
    createElementCount: (source.match(/\bcreateElement\b/g) ?? []).length,
    bytes: source.length,
  };
}

/** The bundle path for a screen, from the manifest's `viewModuleName`
 *  (`OutSystemsUIWebsite.ScreenTemplatesWebPreview.Productcatalog.mvc$view`)
 *  and the app's base path: `<base>/scripts/<Module>.<Flow>.<Screen>.mvc.js`.
 *  The version query is looked up in `urlVersions` when present. */
export function viewBundlePath(
  basePath: string,
  viewModuleName: string,
  urlVersions: Readonly<Record<string, string>>,
): string | null {
  const m = /^(.+)\.mvc\$view$/.exec(viewModuleName);
  if (m === null) return null;
  const path = `${basePath.replace(/\/+$/, '')}/scripts/${m[1]}.mvc.js`;
  const version = urlVersions[path];
  return version === undefined ? path : `${path}${version}`;
}
