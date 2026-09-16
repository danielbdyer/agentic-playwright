/**
 * Study partition — the clean-room rule applied at route
 * granularity for a real Reactive substrate.
 *
 * `docs/v2-cold-start-cohort-spike.md §4.4` partitions AUTs into
 * `training` and `held-out`. A real Reactive host serves many
 * independent screens under one base URL, so the partition has to
 * be declared per route or the whole host is spent on first
 * contact. The manifest at
 * `workshop/substrate-study/corpus/<aut>.partition.json` declares
 * three route classes:
 *
 *   study        — may be harvested, walked, and distilled from.
 *   heldOut      — reserved for a designated single-use evaluation;
 *                  never fetched by any harness before then (C2).
 *   outOfScope   — documentation screens; never fetched.
 *
 * The guard below is the harvest-seam analogue of
 * `workshop/customer-backlog/application/cohort-trust-guard.ts`:
 * every harvest invocation calls `assertHarvestAllowed` BEFORE
 * navigation. A route that is not explicitly `study` is refused —
 * unknown routes included, because "not declared" is not the same
 * as "not held-out".
 *
 * Pure — no Effect, no IO beyond the loader's single readFileSync.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TesseractError } from '../../../product/domain/kernel/errors';

export type StudyRouteClass = 'study' | 'held-out' | 'out-of-scope' | 'unknown';

export interface StudyPartitionManifest {
  readonly $schemaVersion: 1;
  readonly aut: string;
  readonly baseUrl: string;
  readonly moduleName: string;
  readonly moduleInfoEndpoint: string;
  readonly versionTokenAtDeclaration: string;
  readonly versionSequenceAtDeclaration: number;
  readonly declaredAt: string;
  readonly declaredBy: string;
  readonly publisher: string;
  readonly rules: readonly string[];
  readonly routes: {
    readonly study: readonly string[];
    readonly heldOut: readonly string[];
    readonly outOfScope: readonly string[];
  };
}

export class HeldOutRouteContactAttempt extends TesseractError {
  override readonly _tag = 'HeldOutRouteContactAttempt' as const;

  constructor(detail: string, cause?: unknown) {
    super(
      'substrate-study-clean-room-violation',
      `Harvest refused: ${detail}`,
      cause,
    );
    this.name = 'HeldOutRouteContactAttempt';
  }
}

export const STUDY_PARTITION_DIR = path.join('workshop', 'substrate-study', 'corpus');

/** Load a partition manifest by AUT name. Throws on a missing or
 *  malformed file — a harvest with no declared partition must not
 *  proceed (C1). */
export function loadStudyPartition(rootDir: string, aut: string): StudyPartitionManifest {
  const file = path.join(rootDir, STUDY_PARTITION_DIR, `${aut}.partition.json`);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as StudyPartitionManifest;
  if (parsed.$schemaVersion !== 1) {
    throw new HeldOutRouteContactAttempt(
      `partition manifest ${file} has unsupported schemaVersion ${String(parsed.$schemaVersion)}`,
    );
  }
  return parsed;
}

/** Normalize a URL or bare route to the route name the manifest
 *  lists: strip the base URL, leading/trailing slashes, and any
 *  query string or fragment. The root shell normalizes to ''. */
export function routeOf(manifest: StudyPartitionManifest, urlOrRoute: string): string {
  const base = manifest.baseUrl.replace(/\/+$/, '');
  let rest = urlOrRoute.startsWith(base) ? urlOrRoute.slice(base.length) : urlOrRoute;
  rest = rest.replace(/[?#].*$/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return rest;
}

/** Classify a URL or route against the manifest. Pure. */
export function classifyRoute(manifest: StudyPartitionManifest, urlOrRoute: string): StudyRouteClass {
  const route = routeOf(manifest, urlOrRoute);
  const eq = (candidate: string): boolean => candidate.toLowerCase() === route.toLowerCase();
  if (manifest.routes.study.some(eq)) return 'study';
  if (manifest.routes.heldOut.some(eq)) return 'held-out';
  if (manifest.routes.outOfScope.some(eq)) return 'out-of-scope';
  return 'unknown';
}

/** True iff the URL belongs to the manifest's host at all. A harness
 *  pointed at a different origin is not this manifest's concern and
 *  must consult its own partition. */
export function isUnderBase(manifest: StudyPartitionManifest, url: string): boolean {
  return url.startsWith(manifest.baseUrl.replace(/\/+$/, ''));
}

/** Throw unless the URL is an explicitly declared `study` route.
 *  Callers invoke this BEFORE `page.goto`. */
export function assertHarvestAllowed(manifest: StudyPartitionManifest, url: string): void {
  if (!isUnderBase(manifest, url)) {
    throw new HeldOutRouteContactAttempt(
      `${url} is not under the declared base ${manifest.baseUrl}; no partition covers it`,
    );
  }
  const klass = classifyRoute(manifest, url);
  if (klass === 'study') return;
  const route = routeOf(manifest, url) || '(root)';
  throw new HeldOutRouteContactAttempt(
    `route '${route}' is classified '${klass}' under partition '${manifest.aut}'; only 'study' routes may be harvested (C2)`,
  );
}

/** Predicate form for callers that branch rather than throw. */
export function harvestAllowed(manifest: StudyPartitionManifest, url: string): boolean {
  return isUnderBase(manifest, url) && classifyRoute(manifest, url) === 'study';
}

/** The three route lists must be pairwise disjoint and non-empty
 *  where the clean-room rule needs them: at least one held-out
 *  route must remain, or the partition has no honest denominator.
 *  Returns the violations found (empty = valid). Pure; used by the
 *  law test and by the loader's callers. */
export function partitionViolations(manifest: StudyPartitionManifest): readonly string[] {
  const out: string[] = [];
  const norm = (r: string): string => r.toLowerCase();
  const study = new Set(manifest.routes.study.map(norm));
  const held = new Set(manifest.routes.heldOut.map(norm));
  const oos = new Set(manifest.routes.outOfScope.map(norm));
  for (const r of study) {
    if (held.has(r)) out.push(`route '${r}' is both study and heldOut`);
    if (oos.has(r)) out.push(`route '${r}' is both study and outOfScope`);
  }
  for (const r of held) {
    if (oos.has(r)) out.push(`route '${r}' is both heldOut and outOfScope`);
  }
  if (held.size === 0) out.push('no held-out routes remain; the partition has no generalization denominator');
  if (study.size === 0) out.push('no study routes declared; nothing may be harvested');
  return out;
}
