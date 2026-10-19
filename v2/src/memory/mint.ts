/**
 * memory.mint as a pure plan: (catalog, stats, input) → the new catalog, the
 * facet, and the evidence events to append. The service appends the events
 * first and then saves the catalog, so a crash leaves the log as the record.
 *
 * Rules:
 * - id = screen + ':' + slug(draft.name ?? draft.displayName).
 * - The locator is, in order: draft.locator, the verified locator the caller
 *   passes (from app.act or the resolver), or one derived from the snapshot
 *   candidate (recorded as unverified).
 * - The same id with an equivalent target (same locator, or same role, name,
 *   and landmark) folds into the existing facet: evidence appended, aliases
 *   merged, created:false. A different target under the id is a conflict.
 * - A locator another facet already owns is a conflict (use memory.enrich).
 * - A verified locator is the facet's first resolution attempt: new facets
 *   start at 1/1.
 * - Page-object member names are frozen: a new facet gets `member`, unique on
 *   its screen, and facets of a catalog written before names were frozen get
 *   the name they are emitted under today, so a later mint or retirement
 *   cannot rename a member that existing specs call.
 */
import { ToolError } from '../core/errors.js';
import type { PiiMode } from '../core/pii.js';
import type { Candidate, Facet, FacetDraft, FacetKind, FacetLocator, LocatorSpec, Provenance, ResolvedLocator } from '../contract/schemas.js';
import { bareLocator, facetIdFrom, localIdFor, locatorKeyOf } from './ids.js';
import { cleanName, deriveLocator, isEquivalentTarget, mergeAliases, ownerOfLocator, targetIdentity } from './draft.js';
import { freezeMemberNames } from './member.js';
import type { EventFactory, EvidenceEvent, MintProvenance, ScreenCatalog } from './types.js';

/** A draft as the tool receives it; kind defaults to element. */
export type MintDraft = Omit<FacetDraft, 'kind'> & { readonly kind?: FacetKind };

export interface MintPlanInput {
  readonly screen: string;
  readonly draft: MintDraft;
  /** The snapshot candidate the facet describes (loaded by the caller from `.tesseract/snapshots/<snapshotId>.json`). */
  readonly candidate: Candidate;
  readonly snapshotId: string;
  /** The locator the resolver verified for this candidate, when there is one. */
  readonly verified?: ResolvedLocator;
  readonly provenance: MintProvenance;
}

export interface MintContext {
  readonly pii: PiiMode;
  readonly now: string;
  readonly makeEvent: EventFactory;
  /** Builds the facet's `evidence` pointer from its minted event id. */
  readonly pointer: (eventId: string) => string;
}

export interface MintPlan {
  readonly catalog: ScreenCatalog;
  readonly facet: Facet;
  readonly created: boolean;
  readonly events: readonly EvidenceEvent[];
  readonly warnings: readonly string[];
}

interface ChosenLocator {
  readonly locator: FacetLocator;
  readonly verified: boolean;
}

const sameLocator = (a: LocatorSpec, b: LocatorSpec): boolean => locatorKeyOf(a) === locatorKeyOf(b);

/** draft.locator, else the verified locator, else one derived from the candidate. */
export const chooseLocator = (input: Pick<MintPlanInput, 'draft' | 'candidate' | 'verified'>, kind: FacetKind): ChosenLocator => {
  const verifiedLocator = input.verified !== undefined && input.verified.verified ? bareLocator(input.verified.locator) : undefined;
  if (input.draft.locator !== undefined) {
    const locator = bareLocator(input.draft.locator);
    return { locator, verified: verifiedLocator !== undefined && sameLocator(locator, verifiedLocator) };
  }
  if (input.verified !== undefined) return { locator: bareLocator(input.verified.locator), verified: verifiedLocator !== undefined };
  const derived = deriveLocator(input.candidate, { kind, ...(input.draft.parameter !== undefined ? { parameter: input.draft.parameter } : {}) });
  if (derived === null) {
    throw new ToolError(
      'invalid-input',
      `cannot derive a locator for candidate ${input.candidate.ref} (no role and name, placeholder, text, test id, or id); pass facet.locator with the locator app.act resolved`,
      { candidateRef: input.candidate.ref },
    );
  }
  return { locator: derived.note !== undefined ? { ...derived.locator, note: derived.note } : derived.locator, verified: false };
};

const provenanceOf = (input: MintPlanInput, now: string): Provenance => ({
  mintedAt: input.provenance.mintedAt ?? now,
  instrument: input.provenance.instrument,
  ...(input.provenance.session !== undefined ? { session: input.provenance.session } : {}),
  ...(input.provenance.model !== undefined ? { model: input.provenance.model } : {}),
  ...(input.provenance.testCase !== undefined ? { testCase: input.provenance.testCase } : {}),
  snapshotId: input.snapshotId,
  candidateRef: input.candidate.ref,
  ...(input.provenance.flow !== undefined ? { flow: input.provenance.flow } : {}),
});

const scopeOf = (draft: MintDraft, candidate: Candidate): Facet['scope'] => {
  const landmark = draft.scope?.landmark ?? candidate.landmark;
  const dataBlock = draft.scope?.dataBlock ?? candidate.dataBlock;
  return landmark === undefined && dataBlock === undefined
    ? undefined
    : { ...(landmark !== undefined ? { landmark } : {}), ...(dataBlock !== undefined ? { dataBlock } : {}) };
};

const conflictOwner = (owner: Facet, key: string): ToolError =>
  new ToolError(
    'conflict',
    `facet ${owner.id} already has this locator; to add words or a locator to it, call memory.enrich on ${owner.id}`,
    { existingId: owner.id, hint: 'memory.enrich', locatorKey: key },
  );

const replaceFacet = (catalog: ScreenCatalog, facet: Facet): ScreenCatalog => ({
  ...catalog,
  facets: [...catalog.facets.filter((f) => f.id !== facet.id), facet].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
});

/** Fold an equivalent re-mint into the existing facet. */
const remint = (catalog: ScreenCatalog, existing: Facet, input: MintPlanInput, chosen: ChosenLocator, ctx: MintContext): MintPlan => {
  if (existing.status === 'retired') {
    throw new ToolError('conflict', `facet ${existing.id} is retired; mint under another name, or set its status in the catalog YAML to bring it back`, {
      existingId: existing.id,
      status: 'retired',
    });
  }
  const key = locatorKeyOf(chosen.locator);
  const known = existing.locators.some((locator) => locatorKeyOf(locator) === key);
  if (!known) {
    const owner = ownerOfLocator(catalog.facets, key, existing.id);
    if (owner !== undefined) throw conflictOwner(owner, key);
  }
  const merged = mergeAliases(existing.aliases, input.draft.aliases ?? [], existing.displayName, ctx.pii);
  // A different locator for the same element joins the facet: in front when it was
  // verified on the live page (it wins ties on save), as a fallback when it was only derived.
  const locators = known ? existing.locators : chosen.verified ? [chosen.locator, ...existing.locators] : [...existing.locators, chosen.locator];
  // As with enrich: a new locator on a stale facet is a repair, unproven until a run confirms it.
  const repaired = !known && existing.status === 'stale';
  const frozen = freezeMemberNames(catalog.facets).facets;
  const base = frozen.find((f) => f.id === existing.id) ?? existing;
  const facet: Facet = { ...base, aliases: [...merged.aliases], locators, status: repaired ? 'candidate' : existing.status };
  const enriched = ctx.makeEvent({
    kind: 'enriched',
    facetId: existing.id,
    via: 'mint',
    aliasesAdded: [...merged.added],
    ...(known ? {} : { locatorAdded: { key, locator: bareLocator(chosen.locator), verified: chosen.verified } }),
    snapshotId: input.snapshotId,
    candidateRef: input.candidate.ref,
  });
  const resolved = chosen.verified
    ? [ctx.makeEvent({ kind: 'resolved', facetId: existing.id, locatorKey: key, outcome: 'ok', matches: 1, source: 'mint' })]
    : [];
  const status = repaired
    ? [ctx.makeEvent({ kind: 'status', facetId: existing.id, from: 'stale', to: 'candidate', reason: 'repaired', by: 'tool' })]
    : [];
  return {
    catalog: replaceFacet({ ...catalog, facets: frozen }, facet),
    facet,
    created: false,
    events: [enriched, ...resolved, ...status],
    warnings: merged.dropped.map((d) => `alias dropped: ${d}`),
  };
};

export const planMint = (catalog: ScreenCatalog, input: MintPlanInput, ctx: MintContext): MintPlan => {
  const kind: FacetKind = input.draft.kind ?? 'element';
  const displayName = cleanName(input.draft.displayName, ctx.pii);
  if (displayName.length === 0) throw new ToolError('invalid-input', 'facet.displayName must name the element in words');
  const id = facetIdFrom(input.screen, localIdFor({ ...(input.draft.name !== undefined ? { name: input.draft.name } : {}), displayName }));
  const chosen = chooseLocator(input, kind);
  const scope = scopeOf(input.draft, input.candidate);
  const existing = catalog.facets.find((facet) => facet.id === id);

  if (existing !== undefined) {
    if (!isEquivalentTarget(existing, targetIdentity(chosen.locator, input.candidate, existing.scope?.landmark))) {
      throw new ToolError(
        'conflict',
        `facet ${id} already exists for a different element; give this one another name, or call memory.enrich on ${id} if it is the same element`,
        { existingId: id },
      );
    }
    return remint(catalog, existing, input, chosen, ctx);
  }

  const key = locatorKeyOf(chosen.locator);
  const owner = ownerOfLocator(catalog.facets, key, id);
  if (owner !== undefined) throw conflictOwner(owner, key);

  const merged = mergeAliases([], input.draft.aliases ?? [], displayName, ctx.pii);
  const provenance = provenanceOf(input, ctx.now);
  const minted = ctx.makeEvent({
    kind: 'minted',
    facetId: id,
    facetKind: kind,
    displayName,
    provenance,
    locatorKeys: [key],
    locators: [bareLocator(chosen.locator)],
    verified: chosen.verified,
  });
  const role = input.draft.role ?? (input.candidate.role.length > 0 ? input.candidate.role : undefined);
  const tag = input.draft.tag ?? (input.candidate.tag.length > 0 ? input.candidate.tag : undefined);
  const draftFacet: Facet = {
    id,
    screen: input.screen,
    kind,
    displayName,
    aliases: [...merged.aliases],
    ...(role !== undefined ? { role } : {}),
    ...(tag !== undefined ? { tag } : {}),
    namingSource: input.draft.namingSource ?? input.candidate.namingSource,
    affordance: input.draft.affordance ?? input.candidate.affordance,
    ...(scope !== undefined ? { scope } : {}),
    locators: [chosen.locator],
    ...(input.draft.parameter !== undefined ? { parameter: input.draft.parameter } : {}),
    status: 'candidate',
    provenance,
    evidence: ctx.pointer(minted.eventId),
  };
  const frozen = freezeMemberNames(catalog.facets, draftFacet);
  const facet = frozen.added ?? draftFacet;
  const resolved = chosen.verified
    ? [ctx.makeEvent({ kind: 'resolved', facetId: id, locatorKey: key, outcome: 'ok', matches: 1, source: 'mint' })]
    : [];
  return {
    catalog: replaceFacet({ ...catalog, facets: frozen.facets }, facet),
    facet,
    created: true,
    events: [minted, ...resolved],
    warnings: [
      ...merged.dropped.map((d) => `alias dropped: ${d}`),
      ...(chosen.verified ? [] : [`locator ${chosen.locator.strategy} was not verified on the live page; it starts unproven`]),
    ],
  };
};
