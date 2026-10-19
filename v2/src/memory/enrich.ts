/**
 * memory.enrich as a pure plan. Adds words (aliases), a new or repaired
 * locator (placed first, and kept first until it fails: see derive.ts; a
 * locator the facet already has is moved first), or a new display name (the
 * old one is kept as an alias so steps written in the old words still
 * match), or retires the facet. A new locator first on a stale facet is a
 * repair: the facet goes back to candidate, because a repair is unproven
 * until a run confirms it. Nothing is overwritten silently; every change is
 * an evidence event and a line in `changes`.
 */
import { ToolError } from '../core/errors.js';
import type { PiiMode } from '../core/pii.js';
import type { Facet, LocatorSpec, ResolvedLocator } from '../contract/schemas.js';
import { renderLocator } from '../locator/locator.js';
import { bareLocator, locatorKeyOf } from './ids.js';
import { cleanName, mergeAliases, ownerOfLocator } from './draft.js';
import type { EventFactory, EvidenceEvent, ScreenCatalog, StatusChange } from './types.js';
import { freezeMemberNames } from './member.js';

export interface EnrichPlanInput {
  readonly facetId: string;
  readonly aliases?: readonly string[];
  /** A new or repaired locator. Defaults to `verified.locator` when only that is given. */
  readonly locator?: LocatorSpec;
  /** The resolver's result for the cited candidate; marks the locator verified when it is the same locator. */
  readonly verified?: ResolvedLocator;
  readonly displayName?: string;
  readonly retire?: boolean;
  /** The snapshot candidate that justifies the change. */
  readonly evidence: { readonly snapshotId: string; readonly ref: string };
}

export interface EnrichContext {
  readonly pii: PiiMode;
  readonly makeEvent: EventFactory;
}

export interface EnrichPlan {
  readonly catalog: ScreenCatalog;
  readonly facet: Facet;
  readonly changes: readonly string[];
  readonly statusChanges: readonly StatusChange[];
  readonly events: readonly EvidenceEvent[];
}

const replaceFacet = (catalog: ScreenCatalog, facet: Facet): ScreenCatalog => ({
  ...catalog,
  facets: catalog.facets.map((f) => (f.id === facet.id ? facet : f)),
});

export const planEnrich = (loaded: ScreenCatalog, input: EnrichPlanInput, ctx: EnrichContext): EnrichPlan => {
  // Freeze page-object member names first, so retiring or renaming one facet can never shift
  // another facet's member (and so silently change what an existing spec calls).
  const catalog: ScreenCatalog = { ...loaded, facets: freezeMemberNames(loaded.facets).facets };
  const existing = catalog.facets.find((facet) => facet.id === input.facetId);
  if (existing === undefined) {
    throw new ToolError('not-found', `no facet ${input.facetId} in .tesseract/catalog/${catalog.screen}.yaml; mint it first with memory.mint`, {
      facetId: input.facetId,
    });
  }
  if (existing.status === 'retired') {
    throw new ToolError('conflict', `facet ${existing.id} is retired; set its status in the catalog YAML to bring it back, or mint a new facet`, {
      existingId: existing.id,
      status: 'retired',
    });
  }

  // Display name: the old name stays findable as an alias.
  const newName = input.displayName !== undefined ? cleanName(input.displayName, ctx.pii) : undefined;
  if (newName !== undefined && newName.length === 0) throw new ToolError('invalid-input', 'displayName must name the element in words');
  const renamed = newName !== undefined && newName !== existing.displayName;
  const displayName = renamed ? newName : existing.displayName;
  const proposedAliases = [...(renamed ? [existing.displayName] : []), ...(input.aliases ?? [])];
  const merged = mergeAliases(
    existing.aliases.filter((alias) => alias.toLowerCase() !== displayName.toLowerCase()),
    proposedAliases,
    displayName,
    ctx.pii,
  );

  // Locator: new ones go first; a locator the facet already has is not added twice.
  const proposed = input.locator ?? input.verified?.locator;
  const locator = proposed !== undefined ? bareLocator(proposed) : undefined;
  const key = locator !== undefined ? locatorKeyOf(locator) : undefined;
  const isNew = key !== undefined && !existing.locators.some((l) => locatorKeyOf(l) === key);
  if (isNew) {
    const owner = ownerOfLocator(catalog.facets, key, existing.id);
    if (owner !== undefined) {
      throw new ToolError('conflict', `facet ${owner.id} already has this locator; enrich ${owner.id} instead, or retire one of them`, {
        existingId: owner.id,
        hint: 'memory.enrich',
        locatorKey: key,
      });
    }
  }
  const verified =
    locator !== undefined && input.verified !== undefined && input.verified.verified && locatorKeyOf(input.verified.locator) === key;
  // A locator the facet already has, named again, is the repair: it goes first too.
  const movedFirst = !isNew && key !== undefined && existing.locators.length > 0 && locatorKeyOf(existing.locators[0]!) !== key;
  const locators =
    isNew && locator !== undefined
      ? [locator, ...existing.locators]
      : movedFirst
        ? [...existing.locators.filter((l) => locatorKeyOf(l) === key), ...existing.locators.filter((l) => locatorKeyOf(l) !== key)]
        : existing.locators;

  // A different locator first on a stale facet is a repair (unproven until a run confirms it).
  const repaired = (isNew || movedFirst) && existing.status === 'stale';
  const retiring = input.retire === true;
  const status = retiring ? 'retired' : repaired ? 'candidate' : existing.status;

  const facet: Facet = {
    ...existing,
    displayName,
    aliases: [...merged.aliases],
    locators,
    status,
  };

  const enriched = ctx.makeEvent({
    kind: 'enriched',
    facetId: existing.id,
    via: 'enrich',
    aliasesAdded: [...merged.added],
    ...(isNew && locator !== undefined && key !== undefined ? { locatorAdded: { key, locator, verified } } : {}),
    ...(movedFirst && key !== undefined ? { locatorFirst: key } : {}),
    ...(renamed ? { displayName: { from: existing.displayName, to: displayName } } : {}),
    snapshotId: input.evidence.snapshotId,
    candidateRef: input.evidence.ref,
  });
  const resolved =
    verified && key !== undefined
      ? [ctx.makeEvent({ kind: 'resolved', facetId: existing.id, locatorKey: key, outcome: 'ok', matches: 1, source: 'enrich' })]
      : [];
  const statusChanges: StatusChange[] = [
    ...(repaired ? [{ facetId: existing.id, from: existing.status, to: 'candidate' as const, reason: 'repaired' as const }] : []),
    ...(retiring ? [{ facetId: existing.id, from: repaired ? ('candidate' as const) : existing.status, to: 'retired' as const, reason: 'retired' as const }] : []),
  ];
  const statusEvents = statusChanges.map((change) =>
    ctx.makeEvent({ kind: 'status', facetId: change.facetId, from: change.from, to: change.to, reason: change.reason, by: 'tool' }),
  );

  const changes = [
    ...(renamed ? [`displayName: "${existing.displayName}" → "${displayName}"`] : []),
    ...(merged.added.length > 0 ? [`aliases added: ${merged.added.join(', ')}`] : []),
    ...merged.dropped.map((d) => `alias dropped: ${d}`),
    ...(isNew && locator !== undefined ? [`locator added first${verified ? ' (verified)' : ' (unverified)'}: ${renderLocator(locator)}`] : []),
    ...(movedFirst && locator !== undefined ? [`locator moved first${verified ? ' (verified)' : ''}: ${renderLocator(locator)}`] : []),
    ...(!isNew && !movedFirst && locator !== undefined ? [`locator already known: ${renderLocator(locator)}${verified ? ' (verification recorded)' : ''}`] : []),
    ...statusChanges.map((change) => `status: ${change.from} → ${change.to} (${change.reason})`),
  ];

  return {
    catalog: replaceFacet(catalog, facet),
    facet,
    changes,
    statusChanges,
    events: [enriched, ...resolved, ...statusEvents],
  };
};
