/**
 * memory.enrich as a pure plan. Adds words (aliases), a new or repaired
 * locator (inserted first; ordering by health and ladder rank happens on
 * save, and the new locator wins ties), or a new display name (the old one
 * is kept as an alias so steps written in the old words still match), or
 * retires the facet. A new locator on a stale facet is a repair: the facet
 * goes back to candidate, because a repair is unproven until a run confirms
 * it. Nothing is overwritten silently; every change is an evidence event
 * and a line in `changes`.
 */
import { ToolError } from '../core/errors.js';
import type { PiiMode } from '../core/pii.js';
import type { Facet, LocatorSpec, ResolvedLocator } from '../contract/schemas.js';
import { renderLocator } from '../locator/locator.js';
import { bareLocator, locatorKeyOf } from './ids.js';
import { cleanName, mergeAliases, ownerOfLocator } from './draft.js';
import type { EventFactory, EvidenceEvent, ScreenCatalog, StatusChange } from './types.js';

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

export const planEnrich = (catalog: ScreenCatalog, input: EnrichPlanInput, ctx: EnrichContext): EnrichPlan => {
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

  const repaired = isNew && existing.status === 'stale';
  const retiring = input.retire === true;
  const status = retiring ? 'retired' : repaired ? 'candidate' : existing.status;

  const facet: Facet = {
    ...existing,
    displayName,
    aliases: [...merged.aliases],
    locators: isNew && locator !== undefined ? [locator, ...existing.locators] : existing.locators,
    status,
  };

  const enriched = ctx.makeEvent({
    kind: 'enriched',
    facetId: existing.id,
    via: 'enrich',
    aliasesAdded: [...merged.added],
    ...(isNew && locator !== undefined && key !== undefined ? { locatorAdded: { key, locator, verified } } : {}),
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
    ...(!isNew && locator !== undefined ? [`locator already known: ${renderLocator(locator)}${verified ? ' (verification recorded)' : ''}`] : []),
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
