import path from 'node:path';
import { readJson, listFiles } from '../core/fsio.js';
import { ToolError } from '../core/errors.js';
import { resolveInside, type Workspace } from './workspace.js';

/**
 * An environment profile is a small file the customer owns. Credentials never
 * live here: authentication is either a storage-state file the customer
 * produced, or a recorded login flow whose secrets are parameters supplied
 * from the environment at run time.
 */
export interface Profile {
  readonly name: string;
  readonly baseURL: string;
  /** Path (relative to root) of a Playwright storage-state JSON. */
  readonly storageStatePath?: string;
  /** Name of a recorded flow under .tesseract/flows/ that logs in. */
  readonly loginFlow?: string;
  readonly tenant?: string;
  readonly dataSet?: string;
  readonly headed?: boolean;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly locale?: string;
  readonly timezoneId?: string;
}

const PROFILE_NAME = /^[A-Za-z0-9._-]{1,64}$/;

export const profilePath = (workspace: Workspace, name: string): string => {
  if (!PROFILE_NAME.test(name)) throw new ToolError('invalid-input', `invalid profile name: ${name}`);
  return path.join(workspace.paths.profiles, `${name}.json`);
};

/**
 * Load a profile by name. With no name, `TESSERACT_PROFILE` is used; with
 * neither, returns null (the caller must then have an explicit URL).
 * `TESSERACT_BASE_URL` overrides the profile's baseURL, which is how a CI
 * job points the same profile at a preview environment.
 */
export const loadProfile = async (
  workspace: Workspace,
  name: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Profile | null> => {
  const chosen = name ?? env.TESSERACT_PROFILE;
  if (chosen === undefined || chosen.length === 0) {
    return env.TESSERACT_BASE_URL ? { name: 'env', baseURL: env.TESSERACT_BASE_URL } : null;
  }
  const raw = await readJson<Partial<Profile>>(profilePath(workspace, chosen));
  if (raw === null) {
    throw new ToolError('not-configured', `profile not found: .tesseract/profiles/${chosen}.json`, { profile: chosen });
  }
  const baseURL = env.TESSERACT_BASE_URL ?? raw.baseURL;
  if (typeof baseURL !== 'string' || baseURL.length === 0) {
    throw new ToolError('not-configured', `profile ${chosen} has no baseURL`, { profile: chosen });
  }
  if (raw.storageStatePath !== undefined) resolveInside(workspace, raw.storageStatePath);
  return { ...raw, name: chosen, baseURL } as Profile;
};

export const listProfiles = async (workspace: Workspace): Promise<readonly string[]> =>
  (await listFiles(workspace.paths.profiles, '.json')).map((file) => path.basename(file, '.json'));

/** Resolve a URL that may be relative to the profile's baseURL. */
export const resolveUrl = (url: string | undefined, profile: Profile | null): string => {
  if (url !== undefined && /^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (profile === null) {
    if (url === undefined) throw new ToolError('invalid-input', 'no url given and no profile selected');
    throw new ToolError('invalid-input', `relative url "${url}" needs a profile with a baseURL`);
  }
  const base = profile.baseURL.endsWith('/') ? profile.baseURL : `${profile.baseURL}/`;
  if (url === undefined || url.length === 0) return profile.baseURL;
  return new URL(url.replace(/^\//, ''), base).toString();
};
