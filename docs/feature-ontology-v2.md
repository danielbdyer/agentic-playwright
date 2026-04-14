# Feature Ontology (v2)

> Status: v2 planning — prospective feature decomposition implied by [`v2-substrate.md`](v2-substrate.md). Not an inventory of existing code; a map of features the substrate's level spine will force into existence.

This document is a companion to `docs/v2-substrate.md`. The substrate names the five primitives (agent, intent source, world, instruments, memory) and the five-level spine (L0 → L4). This ontology decomposes each level into the specific agent-facing features that level's shipping claim forces into existence. The goal is not to catalog everything v2 might have; it is to give anyone proposing a feature a cheap way to decide whether it belongs, where it belongs, and when.

Three uses:

1. **Feature-placement check.** A proposed feature maps to a level and to the primitive it operates on. If it cannot, it is scaffolding, not a feature; route it through substrate §6 before adopting it.
2. **Level-claim protection.** Each level has a narrow shipping claim (substrate §5). A feature that does not help that claim, and does not directly enable a later-level claim, defers.
3. **Ontology discipline.** A feature ontology grows with the system. Early levels specify features concretely; later levels are sketched. Complexity emerges; it is not legislated.

## 1) The map — primitives × levels

Every feature in v2 is a triple: *(level, primitive, claim)*. That triple is enough to decide membership.

| Level | Primitives exercised | What's new at this level |
| --- | --- | --- |
| L0 | Agent, Intent, World, Instruments (Playwright, ADO, test runner) | Two instruments sufficient to ship a first test. No memory. Tests composed from live observation. |
| L1 | + Memory | Facet catalog, populated from discovery, read during authoring. |
| L2 | + Instruments (Dialog, Document) | Operator-supplied semantics enter memory; vocabulary aligns with the business. |
| L3 | (no new primitive; policy on Memory) | Memory confidence gates DOM-less authoring; drift detection surfaces as a runtime signal. |
| L4 | (no new primitive; process on Memory) | Memory aging, corroboration, revision proposals; self-refinement between authoring passes. |

Features are always anchored to a level. A feature introduced "for later use" at an earlier level is scaffolding.

## 2) Level 0 — the shipping-from-day-one feature surface

L0's claim: the agent authors a QA-legible test against a real ADO work item and the live application, faster than a human would, and a professional QA accepts it into the suite.

Features L0 forces into existence:

- **Intent fetch.** The agent retrieves an ADO work item by ID and extracts its preconditions, actions, and expected outcomes in the terms the work item uses.
- **World exploration.** The agent navigates and observes the application through Playwright. Observations are per-session and ephemeral at L0.
- **Test composition.** The agent produces a Playwright test from the intent and the observation — one test per work item, step descriptions in the business vocabulary implied by the work item.
- **Test execution.** The agent runs the test it authored; the test returns pass/fail plus structured evidence.
- **Review handoff.** The test surfaces to QA in a form a professional reviewer recognizes as professional work. Durable QA extensions land in the intent source (the work item), not the test file, because there is no memory layer at L0 (substrate §3.2).
- **Verb introspection.** The agent reads the vocabulary manifest on session start and becomes fluent in the current verbs before acting. Manifest drift that breaks fluency is a regression (substrate §4).

What is **not** at L0: any facet store, any operator dialog channel, any document ingestion, any drift detection, any self-refinement. L0 is a single-shot authoring loop; its only persistent artifact is the test file.

## 3) Level 1 — the first memory

L1's claim: repeat authoring on a surface the agent has already seen is measurably faster, and uses vocabulary consistent across authoring passes.

Features added:

- **Facet write.** An observation becomes a catalog entry. The entry is self-describing — what was observed, when, by which instrument, with what confidence. Provenance is threaded at minting and travels forward with the facet (substrate §2.5).
- **Facet read.** The agent queries the catalog by intent phrase — not by page or selector. Queries return facets scoped by role, state, affordance, outcome, and vocabulary.
- **Locator health.** Each locator strategy attached to a facet records success and failure outcomes over time. Health is written at L1; it is only *consumed* at L3. Writing it at L1 is required because provenance of this kind cannot be added retroactively.
- **Memory-backed authoring.** Test composition consults memory before reaching for live observation. When memory is sufficient, observation is skipped; when not, observation fills in and writes new entries.

What is **not** at L1: operator-supplied memory, DOM-less authoring policy, drift detection, self-refinement. L1's memory contains only what the agent observed on its own by exercising the application.

## 4) Level 2 — operator semantics enter memory

L2's claim: memory reflects vocabulary and constraints not visible in the DOM, and tests use them; a business analyst recognizes the language as their own.

Features added:

- **Dialog capture.** An instrument records operator clarifications from chat ("that's called 'suspend', not 'pause'"; "service agents can't see the audit log") and converts them into candidate facets.
- **Document ingestion.** An instrument extracts facet candidates from operator-shared materials (requirements, style guides, internal wikis).
- **Candidate review.** Candidate facets surface for operator review before entering memory. Review is lightweight and operator-initiated; the default is human-in-the-loop before dialog or document entries become authoritative.
- **Vocabulary alignment.** Memory's surface vocabulary converges on the operator's terms, and test composition reads the aligned vocabulary when authoring. Generated tests read in the language a BA/PO would use.

Candidate review here is the minimum viable operator oversight. Heavier governance concerns (authority tiers, explicit veto semantics, constituency ordering) are deferred to the level that forces them.

## 5) Level 3 — DOM-less authoring on known-enough surfaces

L3's claim: for a meaningful fraction of the backlog, new tests are authored without re-observing the application, and authoring throughput grows disproportionately to observation cost.

Features added (all policies on memory; no new primitives):

- **Confidence-gated authoring.** When memory confidence about a surface exceeds a threshold, the agent authors without fresh observation. The threshold is set per capability (navigate, click, fill) as the level ships.
- **Runtime drift detection.** When a memory-authored step fails at runtime in a way that indicates memory was wrong about the world, a drift event fires. Locator health (written since L1) is a primary drift signal.
- **Drift event surfacing.** Drift events are visible to the agent (for immediate recovery on the authoring pass) and to the operator (for review). Memory is not silently patched; drift reduces confidence and flags the facet.

What is **not** at L3: autonomous memory revision. Drift is flagged, not fixed.

## 6) Level 4 — self-refinement

L4's claim: memory quality improves between explicit authoring work; false greens and false reds both trend down.

Features added:

- **Confidence aging.** Unused facets decay in confidence over time; their value as authoring sources degrades toward expired.
- **Corroboration.** Facets referenced in passing tests gain confidence. Successful runs are positive evidence.
- **Revision proposal.** The agent proposes memory revisions between authoring passes, drawing on drift events, decay, and corroboration.
- **Revision review.** Proposals surface for human oversight appropriate to the customer's governance. Nothing autonomous modifies memory without review at L4.

Self-refinement here is bounded: it improves quality, not authority.

## 7) Handshake surfaces

Features compose handshakes. A handshake is a specific contracted exchange between two primitives, or between a primitive and itself — who talks to whom, what flows, and what must be true about the exchange. This section names the handshake surfaces the level spine forces into existence: more specific than invariants, less specific than method signatures, and independent of any particular library. A handshake first appears at the level where the primitives it joins are both present; later levels enrich handshakes rather than introducing them.

### 7.1 Agent ↔ Intent source

- **Intent fetch.** Work item ID → structured work item carrying preconditions, actions, and expected outcomes in the source's own vocabulary. Source terms survive the fetch path; nothing is renamed or coerced into an internal schema on the way in.
- **Intent parse.** Raw work item → ordered intent structure. Every extracted item retains source-text provenance so a reviewer can trace any interpreted step back to the exact phrasing it came from.

### 7.2 Agent ↔ World

- **Navigate.** Navigation instruction (URL, a named place, or a route derived from memory) → state-reached confirmation, or a classified failure. Idempotent where possible; destructive operations are flagged before execution, not discovered after.
- **Observe.** Current position → timestamped structured snapshot — the accessibility tree plus any domain-level predicates the world exposes. Snapshots are the raw material for facet minting and the evidence substrate of every later claim about what the world looked like.
- **Interact.** Affordance reference (by name or memory ID) plus a data payload → effect outcome. Failures are classified into recognizable families (not-visible, not-enabled, timeout, assertion-like) where possible, and surface raw only when classification genuinely fails.

### 7.3 Agent ↔ Memory

- **Facet mint.** Observation plus intent context plus originating instrument → a new facet entry with provenance threaded at creation (who observed, when, through what instrument, with what initial confidence). Provenance is minted at birth because it cannot be reconstructed later (substrate §2.5).
- **Facet query.** Intent phrase plus scope → ranked facets with confidence and health. Queries by intent phrase are the primary access path; queries by selector or page are secondary, and not always supported.
- **Facet enrich.** Existing facet plus new evidence → updated facet with evidence appended. Prior provenance is preserved; enrichment never overwrites history. Confidence and health move in response to evidence, but what the facet *was* remains retrievable.

### 7.4 Agent ↔ Test instrument

- **Test compose.** Parsed intent plus queried facets (at L1 and later) → a test file in the target framework's idiom. Step descriptions carry business vocabulary; no selectors appear in the test body; selectors resolve from facets at execution time.
- **Test execute.** Test file → pass/fail plus structured evidence — which steps ran, what was observed at each, which facets were referenced. Evidence is sufficient to distinguish a product failure from a memory-drift failure; the L3 drift machinery depends on this distinction.

### 7.5 Agent ↔ Vocabulary manifest

- **Verb declare.** A new capability or instrument addition → a manifest entry with a stable name, signature, and error modes. In-place expansion of an existing verb's behavior is forbidden: new capability means a new verb, or composition of existing verbs.
- **Manifest introspect.** Session start → the full current verb set. Introspection is cheap enough to run every session; the manifest is the agent's single source of truth for what it can do right now.
- **Fluency check.** Canonical task scenario plus the agent's dispatch → a fluency score. Fluency regression is treated at the same severity as a broken product test (substrate §4).

### 7.6 Memory ↔ World (via instruments)

- **Locator health track.** A locator usage outcome during observation or execution → updated health record on the owning facet. Health is written at L1 even though it is only consumed at L3 — this is the canonical case where the substrate's "provenance cannot be retrofitted" rule binds.
- **Drift emit.** A memory-authored step failing at runtime in a world-mismatch pattern → a drift event tagged with the offending facets, the nature of the mismatch, and the run that surfaced it. Drift is emitted as distinct from product failure; the emitter is the classifier.

### 7.7 Operator instruments ↔ Memory

- **Dialog capture.** An operator chat turn tagged as domain information → one or more candidate facets. The operator's exact wording is preserved as provenance; a paraphrased summary does not substitute for the source text.
- **Document ingest.** An operator-shared document → candidate facets with anchors to specific regions of the source. Every candidate is traceable back to a named location in the document it came from.
- **Candidate review.** Candidate facet plus an operator decision → either an approved facet entering memory (with the operator attached as additional provenance) or a rejected candidate (with rejection rationale preserved). Operator oversight is the L2 default before candidates gain authority.

### 7.8 Memory ↔ itself (L4 processes)

- **Confidence age.** Current memory state plus elapsed time → decayed confidence on facets that have not been corroborated recently. Aging is reversible by corroboration; it is not a garbage collector and never deletes.
- **Corroborate.** A passing test run plus its referenced facets → increased confidence on those facets. Corroboration strength is proportional to how reliably the test has been passing; a flaky test does not corroborate.
- **Revision propose.** Accumulated drift events plus decay plus corroboration → a revision proposal surfaced for operator review. The proposal names the evidence it is based on; if the operator rejects it, the rejection enters the proposal's history and conditions future proposals.

## 8) Agent engagement

The earlier sections describe what the system *is* — its primitives, its levels, its handshakes. The next section (§9) describes the deterministic technical paths those handshakes eventually converge to. This section sits between them: it models what the agent *does* inside the substrate, as its own process and implementation surface, independent of any library. Agent engagement is the primary mode of work at L0 and early L1 — the deterministic paths of §9 are the asymptotic target that engagement converges toward, not a starting assumption.

### 8.1 The ROI curve

The first tests are expensive. The sixth is cheaper. The sixtieth is nearly free.

At L0, the agent has no memory. Every work item it authors is a fresh interpretation: ADO step text is ambiguous in practice (the deterministic XML parse gets you the sequence of steps, but the semantic structure of action and expected is rarely cleanly separable on first read), the SUT's affordances are unknown, the business vocabulary is not yet established. The agent must observe, interpret, and choose at almost every handshake — even ones §9 will describe as "deterministic." What §9 calls deterministic is deterministic *at ROI plateau*: the mechanical operations always are (HTTP calls, file writes, AST emission), but the *content selection* over those mechanics is agent work until enough tests have been authored for patterns to emerge.

ROI plateau arrives in three successive stages as memory builds:

- **Stage α** (first tests, L0). Every handshake is heavily agentic at the interpretive layer. The agent reads each ADO work item end-to-end, interprets ambiguous steps, observes the application, makes locator and phrasing choices that are bespoke. The only deterministic wins are the mechanical ones (file writes, test runner, XML tokenization). Memory after each test is richer by a few facets.
- **Stage β** (after dozens of tests, L1). Enough vocabulary has accrued that facet query returns meaningful matches for many steps. Test compose increasingly draws from the catalog. Locator ladder health has enough data to pick a rung confidently. Agent engagement shrinks to the genuinely novel — new screens, new roles, new idioms.
- **Stage γ** (hundreds of tests, L2+). Operator vocabulary alignment and document ingestion have supplied the semantic layer memory couldn't derive from the DOM alone. Deterministic paths are honored for most steps; agent engagement concentrates on irreducible choices — disambiguation, ambiguity recovery, proposal synthesis.

The sequence is one-way: Stage β does not arrive by decree, it arrives by agent engagement at Stage α. The codebase's job is to make Stage α's agent work land clean provenance into memory so Stage β can consume it. Expensive first authoring is not a bug; it is the substrate's canonical early behavior.

### 8.2 The authoring session as process

An authoring session is the unit of agent engagement. It bounds one or more work items being taken from intent to accepted test. The session's phases:

1. **Fluency intake.** Session start: the agent reads the vocabulary manifest. Verbs, nouns, error families, reversibility classes — known before any action.
2. **Intent acquisition.** A work item is fetched (or several, if the session handles a batch). Source text and structure are preserved.
3. **Memory consultation.** For each work item, the agent queries the catalog with the intent phrase. Returned facets are ranked by confidence and health. Unmatched or below-threshold steps fall to live exploration.
4. **World exploration** (when memory is insufficient). The agent navigates, observes, interacts with the SUT to establish missing facts. Observations become candidate facets.
5. **Authoring.** The agent composes the test, choosing step phrasing, assertion wording, and sequencing. Choices draw from memory where possible; where not, the agent chooses and records provenance.
6. **Execution and evidence.** The test runs. The run record feeds back into locator health (always), drift events (if any), and the evidence that corroborates referenced facets.
7. **Memory write.** New facets mint. Existing facets enrich. Reversibility is respected: everything agent-authored is either self-reversing or proposal-gated.
8. **Session closeout.** The session produces a receipt: work items touched, facets minted or enriched, drift events, proposals surfaced for operator review.

Every phase is bounded. A session that stalls in phase 4 (unlimited exploration) or phase 5 (over-long authoring per item) is a session whose scope was too ambitious; the agent is expected to cut the scope, not expand the session.

### 8.3 The agent's decision surface

Across a session, the agent makes five classes of decision. The ROI curve shrinks class sizes as memory builds, but none of them disappear entirely.

- **Interpretive.** Reading ambiguous step text, operator dialog, or shared documents and producing a candidate interpretation. Early-stage agent work is dominated by this class. Output goes to memory (as candidate facets or aliases) so future sessions spend less time here.
- **Navigational.** Choosing a route through the SUT when multiple options exist. Shrinks as route knowledge enters memory.
- **Affordance.** Choosing the right element or action when a locator ladder or facet query returns multiple plausible matches. Shrinks as locator health data accumulates.
- **Compositional.** Choosing step phrasing, ordering, and assertion text for QA legibility. Shrinks as vocabulary catalog and house-style templates emerge.
- **Governance.** Classifying drift, synthesizing revision rationale, handling proposal conflicts. These never fully mechanize; they remain agentic even at Stage γ plateau.

Every decision produces a receipt: what was being chosen, what choices were presented, which was picked, and what reversal policy applies. Receipts are the raw material of the facet catalog's later deterministic rules.

### 8.4 The implementation surface for agent engagement

The agent interacts with a narrow set of surfaces, each designed for the engagement mode above. None are library-specific; they are *the shape of agent engagement* regardless of what library implements them.

- **Vocabulary manifest.** The session's ground truth for verbs. Read once at session start; not updated during the session. Stable signatures across sessions let the agent reach fluency in a single file read.
- **Decision handoffs.** When deterministic machinery exhausts at a handshake, the pipeline composes a structured decision — *what was tried, what failed, what choices are now open, what reversal is available if the choice is wrong* — rather than throwing. The agent consumes the handoff, picks, and the pick is recorded alongside the handoff. Canonical shape:

```json
{
  "handshake": "<handshake-name>",
  "context": { "<relevant identifiers>" },
  "attempts": [ { "<what was tried, what happened>" } ],
  "choices": [ { "id": "<id>", "description": "<what picking this does>" } ],
  "reversalPolicy": "<how the choice can be undone if wrong>"
}
```

- **Receipt logs.** Every decision the agent makes writes to an append-only log. Receipts carry: handshake, decision context, choices presented, choice picked, reversal policy, timestamp. Receipts are the session's audit trail and the substrate of later pattern emergence.
- **Candidate queues.** For L2+ operator-sourced material, candidates from the agent land in a review queue. The agent surfaces; the operator decides. The agent never writes directly to the durable vocabulary catalog from dialog or documents.
- **Proposal logs.** For L4 refinement, proposals live in a proposal log with their cited evidence. The agent synthesizes; the operator reviews. Nothing writes memory from a proposal until the operator approves.

### 8.5 Invariants the agent relies on

Across every phase of engagement, the agent assumes these without verification. Each is a property of how the substrate is designed, not of any library choice.

1. **Stable verb signatures.** Once published, a verb's inputs, outputs, and error families never change. New capability = new verb.
2. **Provenance at mint.** Memory writes without a full provenance block are rejected; provenance is created at birth and threaded forward.
3. **Append-only history.** Receipt logs, evidence logs, drift logs, proposal logs never delete or rewrite entries.
4. **Named error families.** Failures classify into enumerable categories; raw errors surface only as `unclassified`, never as bare exceptions.
5. **No silent escalation.** Confidence changes, drift events, proposals — all are logged before any downstream consumer sees them.
6. **Reversible agentic writes.** Agent writes are self-reversing, proposal-gated, review-gated, or hard-gated; irreversible mutation requires operator review at or above L2.
7. **Source vocabulary preserved.** Intent terms survive from work item to test; operator wording survives from chat to memory; no renaming on inbound paths.
8. **One source of truth per concern.** Manifest for verbs; catalog for facets; evidence log for history; drift log; proposal log.
9. **Cheap introspection.** Every session starts with a single manifest file read; fluency is the default, not an optimization.
10. **Structured fallthrough.** When determinism exhausts, the agent receives a prepared choice, never a stack trace.

Violation of any is a regression at product-test severity.

### 8.6 Reversibility classes for agent writes

The class determines operator involvement and what happens when a choice is contradicted by later evidence.

- **Self-reversing** (all levels). Confidence, locator health, aliasing decisions. Reversible by rule when contradicting evidence arrives; no operator review required. The underwriter is invariant 3 (append-only): every change leaves a trail, so "reversal" is a new entry, never a rewrite.
- **Proposal-gated** (L2+). Candidate facets from dialog or documents. The agent surfaces the proposal; memory is not written until operator approval. Rejections are preserved with rationale so the same proposal does not recur identically.
- **Review-gated** (L4). Revision proposals against existing facets. The proposal cites the evidence it was synthesized from, so review is comparative (evidence + revision), not just approval (revision alone).
- **Hard-gated** (always). Deletions. The system has no deletion verb; removal happens only via operator edit of the catalog file.

No agentic action is irreversible without operator review at or above L2. The operator's review surface is lightweight by default (a JSONL queue plus a CLI suffices for L2 shipping) but is non-optional.

### 8.7 How agent engagement becomes determinism

The transition from agentic engagement to deterministic handling at each handshake happens through pattern emergence in memory. A worked example — locator resolution:

1. **Stage α.** The agent performs observe → ladder resolution; the ladder returns multiple matches; the agent chooses via a decision handoff. The choice writes a receipt: "for affordance 'save' on customer-detail, pick rung 0 match 1 when `name` includes 'Save' and not 'Save draft'."
2. **After several such receipts,** a pattern accrues in memory: the chosen rung for this affordance has high health; alternative rungs have persistent ambiguity markers. The pattern is stored with its receipts as evidence.
3. **Stage β.** Subsequent observations of the same affordance resolve deterministically via the stored pattern. The decision handoff is not invoked. The agent is spared this choice.
4. **Drift pathway.** If an observation at Stage β contradicts the pattern (the chosen rung no longer resolves), a drift event fires. The next session sees a decision handoff again for that affordance — but enriched with prior receipts and the drift evidence. The agent reconsiders with full context.

This is the shape of every handshake's emergence curve. §9's deterministic technical paths describe the *target rules* the patterns converge toward. Agent engagement — this section — is what produces those rules, one receipt at a time.

### 8.8 What this section does not prescribe

- **How the agent classifies an interpretive decision.** That is a session-level concern for the agent's own prompt engineering, not the codebase's. The codebase offers the decision handoff; the agent decides how it reasons over the offered choices.
- **How to batch work items per session.** Session sizing is a policy choice, deferred to shipping.
- **When to promote a pattern to a deterministic rule.** Promotion is implicit in facet confidence and locator health crossing thresholds; thresholds are deferred to L3.
- **How the agent recovers from a malformed receipt.** Receipts are written by the pipeline; the agent doesn't need a recovery policy for the codebase's own errors.

## 9) Technical paths

This section names the specific libraries, APIs, and sequences of calls that fulfill each handshake at ROI plateau (§8.1). These paths describe the asymptotic deterministic target — the mechanical operations that are always deterministic, plus the interpretive operations that become deterministic once memory has accrued enough patterns. Until plateau, agent engagement (§8) is the primary mode of work for the interpretive layer; §9 is what the patterns emerging from that engagement converge toward. The grain is between method-level implementation and §7's invariants, independent of agent-side concerns which live in §8.

L0 handshakes are fully fleshed out because shipping L0 forces the choices. L1 handshakes are fleshed out in shape, with specifics deferred to L1 shipping. L2–L4 are sketched at primary-path level only. Each subsection follows the same shape: primary path, obligations at this depth, deferred.

### 9.1 Intent fetch (L0, Agent ↔ Intent source)

Primary path — Azure DevOps REST API v7.1 with PAT authentication:

1. Query work-item IDs in scope: `POST {org}/{project}/_apis/wit/wiql?api-version=7.1` with a WIQL filter on `[System.WorkItemType] = 'Test Case'` plus area/iteration/tag predicates if the customer scopes by them.
2. Fetch an individual work item: `GET {org}/{project}/_apis/wit/workitems/{id}?$expand=fields&api-version=7.1`.
3. Read load-bearing fields from the response's `fields` map, keyed by `referenceName`:
   - `System.Title` → title
   - `System.Tags` → semicolon-delimited; split on `'; '`
   - `System.AreaPath`, `System.IterationPath` → preserved as-is for hierarchy
   - `Microsoft.VSTS.Common.Priority` → numeric
   - `Microsoft.VSTS.TCM.Steps` → XML; parsed in §9.2
   - `Microsoft.VSTS.TCM.Parameters` → XML; parameter names
   - `Microsoft.VSTS.TCM.LocalDataSource` → XML; parameter data rows

Obligations at this depth:

- Transient errors (network, timeout, 5xx) are classified and retried with bounded backoff; authentication errors and 404s are not retried and surface as distinct failure modes.
- The work item's `rev` field is carried forward so later drift detection can distinguish "work item changed upstream" from "world changed."
- No renaming of ADO field values on the way in; downstream consumers read the source vocabulary as the source wrote it.

Deferred:

- Adoption of the official Microsoft Azure DevOps MCP server (GA Oct 2025) defers to L1+, when a single intent-source verb set across MCP channels reduces authentication handling and query plumbing. L0 ships on direct REST.
- Custom work-item types beyond `Test Case` (customer process-template extensions). Defer to L0 shipping with the real customer tenant.
- Auth variants beyond PAT (Azure AD, Managed Identity); defer to deployment orchestration.

### 9.2 Intent parse (L0, Agent ↔ Intent source)

Primary path — XML step extraction from `Microsoft.VSTS.TCM.Steps`:

1. Regex-match `<step>` boundaries: `/<step\b[^>]*>([\s\S]*?)<\/step>/gi` on the raw string.
2. Within each step body, extract the two `<parameterizedString>` children: `/<parameterizedString\b[^>]*>([\s\S]*?)<\/parameterizedString>/gi`. The first match is the action text; the second is the expected-outcome text.
3. Decode XML entities (`&lt;`, `&gt;`, `&quot;`, `&#39;`, `&amp;` → `<`, `>`, `"`, `'`, `&`) and unwrap `<![CDATA[...]]>`.
4. Strip inline HTML tags, collapse whitespace, preserve readable emphasis.
5. Parse parameters: `<param name="...">` from `Microsoft.VSTS.TCM.Parameters`.
6. Parse data rows: `<Table1>` sections of `LocalDataSource` yield per-row key-value pairs for substitution.

The tokenization path above is deterministic and always runs. The *semantic layer* — whether action text and expected-outcome text cleanly separate, whether preconditions are buried in prose, whether the step flow matches the work item's declared structure — is agentic at Stage α (§8.1). Real-world customer backlogs rarely hand the system test cases that parse semantically on first read; early work items will tokenize fine and still need the agent's interpretation, which lands as receipts and accrues into memory. By Stage β, common phrasings resolve without agent help; until then, this handshake produces *tokens* deterministically and *intent structure* agentically.

Obligations at this depth:

- Every extracted step retains source-text provenance — the work-item ID, revision, and positional step index — so any reviewer can trace an interpreted step back to the phrasing that produced it.
- Missing `<parameterizedString>` siblings degrade gracefully: expected defaults to empty; no parse exception fires.
- All parsed steps begin at an `intent-only` confidence marker; confidence upgrades only when the step is successfully grounded against the world at L1.

Deferred:

- `Microsoft.VSTS.TCM.Preconditions` handling depends on the customer's process template. Defer.
- Process-template markup variants; the regex path above is baseline, but empirical tuning at shipping may add edge cases.
- Non-English step text and multi-language normalization; defer to the customer's corpus.

### 9.3 Navigate (L0, Agent ↔ World)

Primary path — Playwright `page.goto`:

1. `await page.goto(url, { waitUntil: 'load' | 'domcontentloaded' | 'networkidle', timeout: 30_000 })`. Choice of `waitUntil` depends on how the SUT settles: OutSystems apps frequently settle on `'load'`; apps with heavy async enrichment favor `'networkidle'`. The default is recorded per-URL pattern at the instrument level and reused across sessions.
2. Idempotence: before issuing `goto`, compare `page.url()` to the target; skip if already at destination to avoid re-loading state already observed.
3. Return `{ reachedUrl, status, timingMs }` — enough evidence for the run record.

Obligations at this depth:

- Timeout and network failures classify cleanly into `navigation-timeout` and `navigation-failed`; redirects within the chain are subsumed by Playwright and do not surface as separate events.
- Destructive entry points (login redirects, state-mutating deep links) are not freshly authored at L0. Tests enter through read-safe URLs. If the customer's application forces a destructive entry, that surfaces as a world-contract issue and defers to operator setup of a pre-authorized session fixture.

Deferred:

- Transient retry policy (bounded backoff for flaky networks) belongs at the resilience layer, not at the handshake.
- Session lifecycle (auth refresh, cookie expiry) — handled by test fixtures or environment, not by Navigate itself.

### 9.4 Observe (L0, Agent ↔ World)

Primary path — two Playwright instruments composed:

1. **Accessibility-tree snapshot.** Resolve the target region: a specific `Locator`, or `page.locator('body')` for whole-page observation. Convert to a handle with `locator.elementHandle()`. Call:

   ```
   page.accessibility.snapshot({ root: handle, interestingOnly: false })
   ```

   The returned tree is nested nodes of `{ role, name, value?, checked?, pressed?, disabled?, expanded?, selected?, children? }`. `interestingOnly: false` is deliberate at L0 — maximize the surface area the agent can learn from, even at the cost of verbosity; pruning is a later-level concern.

2. **Locator ladder, in priority order.** Tried sequentially, first match wins; the ladder position at which the match occurred is recorded as degradation metadata:
   - `page.getByRole(role, { name })` — preferred; honors accessibility contracts.
   - `page.getByLabel(label)` — form-coupled, strong for inputs.
   - `page.getByPlaceholder(placeholder)` — input-only.
   - `page.getByText(text)` — last text-based; matches visible content.
   - `page.getByTestId(id)` — strong anchor *if* the app emits `data-testid`; OutSystems-specific.
   - `page.locator(cssSelector)` — last resort.

3. **State probing** (non-ARIA observation that supplements the accessibility tree): `locator.count()`, `locator.isVisible()`, `locator.isEnabled()`, `locator.textContent()`, `locator.inputValue()`, `locator.getAttribute(name)`.

Obligations at this depth:

- Every observation is timestamped and tagged with an observation ID; this is the evidence substrate for every later claim about what the world looked like.
- The snapshot is raw material for facet minting. The Observe handshake does not filter, rename, or interpret; it returns what Playwright emitted after canonicalizing duplicate or presentational nodes.
- Element probes during whole-screen observation run with a small fixed concurrency ceiling (e.g. 4) to avoid hammering the SUT.

Deferred:

- Pixel/screenshot-based observation; L0 uses accessibility tree and state probes only. If the app genuinely cannot be observed through ARIA, that is a world-contract fault and defers to operator intervention.
- `page.evaluate(...)` JavaScript injection; L0 observes, does not rewrite.
- OutSystems-specific observation patterns (which widgets emit semantic roles vs. require fallback; whether `data-testid` is standard) — defer to L0 shipping with a real OutSystems instance. Direct observation of the customer's application is required.

### 9.5 Interact (L0, Agent ↔ World)

Primary path — Playwright locator actions, keyed to the affordance's role:

- Buttons, links, menu items: `locator.click()`.
- Text inputs, search boxes: `locator.fill(text)` (clears and types atomically).
- Native `<select>` dropdowns: `locator.selectOption(value)`.
- Checkboxes and radios: `locator.check()` / `locator.uncheck()`.
- Keyboard: `locator.press(key)` for Enter / Escape / Tab.
- Hover-reveal affordances (tooltips, submenus): `locator.hover()`.

Every interaction resolves the affordance to a locator using the same ladder as §9.4, then invokes the action on that locator. Pre-action state is validated — visibility and enabled-ness — before the action fires, so failures classify pre-attempt rather than after auto-wait timeouts.

Obligations at this depth:

- Failures classify into recognizable families: `not-visible` (target not displayed), `not-enabled` (control disabled or readonly), `timeout` (action hung past the configured window), `assertion-like` (action succeeded but a follow-up state check failed — e.g., click landed but target did not become selected). Raw errors surface only when classification genuinely fails.
- Playwright's auto-waiting subsumes most settle-time concerns; explicit waits are a composition concern, not an interaction-handshake concern.

Deferred:

- Drag-and-drop, multi-touch gestures, pinch-zoom; defer to L2+ if observed demand surfaces.
- File upload flows beyond the native input element; `locator.setInputFiles()` is in scope for that, but JS-driven upload widgets defer.

### 9.6 Test compose (L0, Agent ↔ Test instrument)

Primary path — AST-backed emission against the `@playwright/test` runner:

1. Build an intermediate representation from the parsed intent (§9.2) and — at L1+ — the queried facets (§9.10).
2. Use the TypeScript compiler API (the `typescript` factory, or `ts-morph` as an ergonomic wrapper) to construct the test file as an AST: imports, `test.describe`, `test`, per-step `test.step` blocks, `expect` assertions.
3. Print the AST to a string, format it, write it to the generated-tests directory.

Emitted file shape (representative):

```ts
import { test, expect } from '@playwright/test';

test.describe('10001 — Search for policy by number', () => {
  test('authored by agent', async ({ page }) => {
    await test.step('Navigate to policy search screen', async () => {
      await page.goto('/policies');
    });

    await test.step('Enter policy number', async () => {
      await page.getByRole('textbox', { name: /policy number/i }).fill('ABC123');
    });

    await test.step('Click Search', async () => {
      await page.getByRole('button', { name: /search/i }).click();
      await expect(page.getByRole('heading', { name: /policy details/i })).toBeVisible();
    });
  });
});
```

Obligations at this depth:

- Step titles come from parsed intent, verbatim or minimally normalized; they are the business vocabulary the work item used.
- `test.step(...)` blocks wrap every action so the Playwright HTML report surfaces legible step-level timing and failure context to QA.
- Assertions come from the work item's expected-outcome text, translated into `expect` calls over the same locator ladder as §9.4.
- No selectors in the test body at L1+: the body calls through a facet-keyed facade (`policySearch.enterPolicyNumber('ABC123')`) whose implementation resolves the locator from memory at runtime. At L0, before memory exists, selectors are permitted inline — but the L0 test's shape must be such that L1 memory insertion is a local rewrite, not a rewrite of the whole file.

Deferred:

- LLM-rendered step description refinement (the "make it read even better" pass) — defer to L2, where operator vocabulary alignment gives the model something to refine against.
- Parametric tests driven by the work item's data-source rows — defer to the first L0 work item whose shape demands it.
- Fixture composition beyond `{ page }` (database seeding, API mocks) — defer; L0 runs against live application state.

### 9.7 Test execute (L0, Agent ↔ Test instrument)

Primary path — the Playwright Test runner, invoked via CLI (`npx playwright test {file}`) or the programmatic API. The agent prefers CLI form because it produces the standard HTML report QA already knows, and parses the machine-readable run output (`--reporter=json`) alongside it.

Returned to the agent per run:

```json
{
  "adoId": "10001",
  "runId": "<uuid>",
  "completedAt": "2026-04-14T...",
  "pass": true,
  "steps": [
    { "index": 0, "title": "Navigate to policy search screen", "outcome": "pass", "observedAt": "..." },
    { "index": 1, "title": "Enter policy number",              "outcome": "pass", "observedAt": "..." }
  ],
  "classification": "product-pass"
}
```

Obligations at this depth:

- Step-level evidence is sufficient for an operator to debug and for L1 facet minting to draw from. Each step's observation capture is the same snapshot/state-probe material Observe would have produced.
- Failures classify so L3 can later distinguish `product-fail` (bug in the SUT) from `test-malformed` (agent authored incorrectly) from `transient` (retry-worthy infrastructure hiccup). L0 records the classification but does not act on it.
- The Playwright HTML report lands in a predictable location so QA can open it without help from the agent.

Deferred:

- Drift event emission — L3 machinery.
- Rerun / flakiness tracking — not an L0 concern; L0 executes once, logs outcome.
- Screenshot or video capture policies; the accessibility snapshot in the run record substitutes for visual capture at L0.

### 9.8 Verb declare, Manifest introspect, Fluency check (L0, Agent ↔ Vocabulary manifest)

Primary path:

- **Verb declare.** A verb is declared in a single JSON (or JSONC) manifest file. Each entry carries `{ name, category, inputs, outputs, errorFamilies, sinceVersion }`. New capability means a new entry; amending an existing entry's `inputs` or `outputs` is forbidden — the verb is frozen once published. The manifest is the source of truth and is generated from the code, not hand-edited: a build step emits it, and divergence between code and manifest fails the build.
- **Manifest introspect.** On session start, the agent reads the manifest file — a single `fs.readFile`. The file is small enough (tens of verbs) that reading it on every session is trivial. The parsed structure is the agent's verb table for the session.
- **Fluency check.** A fixture of canonical agent tasks (one per verb, plus a handful of multi-verb scenarios) runs against a fresh agent session. Each task asserts the agent picked the correct verb(s). A dispatch mismatch is a failing test at the same severity as a broken product test.

Obligations at this depth:

- The manifest is always in sync with code by build-time generation, never by discipline.
- Fluency tests are committed and run on developer machines alongside product tests; they are not optional.
- Removing a verb earns a deprecation entry with a removal version; deleting outright is forbidden.

Deferred:

- Exact verb signatures — the manifest learns them level by level (substrate §7).
- Whether the manifest is TypeScript-typed via a generated declaration file or runtime-validated via a schema — defer to L0 shipping, where the agent's actual consumption pattern picks one.

### 9.9 Facet mint (L1, Agent ↔ Memory)

Primary path:

- Facets are stored as per-screen YAML files under a single catalog directory, one file per screen. Each file's root is a map from element ID to facet record. YAML is chosen for git-friendly diffs during early iteration and for human inspection when an operator wants to audit memory directly.
- On startup, the agent loads every YAML file into an in-memory index — a `Map<screenId, Map<elementId, Facet>>`. Subsequent minting appends to the index and writes the affected file back atomically (write to temp, rename).
- At mint time, the facet record captures `provenance = { mintedAt, instrument, agentSessionId, runId }` as a fixed block; this block is immutable for the life of the facet.

Obligations at this depth:

- Provenance is threaded at mint and never retrofitted; a facet without the provenance block is invalid and surfaces as a memory-integrity fault.
- Minting is atomic at the file level; a partial write on crash leaves the previous file intact.

Deferred:

- Scaling past the low hundreds of facets per screen may force a move to SQLite or to a derived index over the YAML source of truth. Defer until L2–L3 throughput makes YAML scan latency visible.
- Facet deletion or deprecation semantics — L1 is append-only; soft-delete flows defer to L4.

### 9.10 Facet query (L1, Agent ↔ Memory)

Primary path — structured-field matching over the in-memory index:

1. The agent parses the intent phrase ("the save affordance on the customer-detail screen for a service agent") into structured constraints: `{ kind: 'affordance', role: 'save', screen: 'customer-detail', roleVisibility: 'service-agent' }`.
2. The index is filtered against those constraints — exact match on `screen` and `kind`, prefix/substring match on `role` and `displayName`, membership match on `roleVisibility`.
3. Matches are ranked by `confidence` (higher first), with `health` as a tiebreaker.
4. Below-threshold matches are still returned but flagged; L3 gating later decides whether to trust them.

Obligations at this depth:

- Queries are deterministic: same catalog state plus same query string → same ranking.
- The parsed-constraint representation is logged alongside the query result so an operator debugging a wrong match can see how the phrase was interpreted.

Deferred:

- Semantic synonymy ("suspend" ↔ "pause") is handled by L2 operator vocabulary alignment (the vocabulary catalog grows), not by the query layer.
- Vector-embedding fuzzy match — defer to the level where catalog scale and synonym frequency force it (L2 or L3).
- LLM-backed query ("which facets match this intent?") — same.

### 9.11 Facet enrich (L1, Agent ↔ Memory)

Primary path — append-only evidence log:

- Alongside each facet record, a sibling JSONL file `<facetId>.evidence.jsonl` records every evidence event: `{ timestamp, outcome, instrument, runId, context }`.
- Confidence is not stored directly on the facet; it is recomputed from the evidence log on read, with a cached summary for hot paths. The summary is invalidated when new evidence arrives.
- The original facet record is never overwritten; only the evidence log grows.

Obligations at this depth:

- Enrichment is strictly additive; old evidence is always retrievable. Drift detection at L3 replays the log deterministically.
- The cached summary (`{ successCount, failureCount, lastSuccessAt, lastFailureAt }`) is a derived artifact and can be dropped and rebuilt without information loss.

Deferred:

- Confidence formula (success-rate decay, Bayesian, win/loss ratio) — emerges at L3 under gating pressure.
- Log compaction or truncation policy — defer to the level where log size becomes visible.

### 9.12 Locator health track (L1, Memory ↔ World via instruments)

Primary path — per-strategy summary on each facet:

```yaml
locatorStrategies:
  - kind: role-name
    value: { role: button, name: Save }
    health: { successCount: 14, failureCount: 0, lastSuccessAt: ..., lastFailureAt: null }
  - kind: test-id
    value: save-policy
    health: { successCount: 2, failureCount: 3, lastSuccessAt: ..., lastFailureAt: ... }
  - kind: css
    value: '.btn-primary[data-role=save]'
    health: { successCount: 0, failureCount: 7, lastSuccessAt: null, lastFailureAt: ... }
```

Every time a strategy is tried during observation or execution, the corresponding health record is updated in place, using the same atomic-file pattern as §9.9.

Obligations at this depth:

- Health is written at L1 even though L1 does not read it; L3 reads it. The substrate's "provenance cannot be retrofitted" rule binds here most concretely.
- Health is a primary artifact, not a statistic. It is not regeneratable from run records alone, because ladder-position metadata is not preserved in the run record.

Deferred:

- Decay or freshness weighting — the summary is counts-plus-timestamps at L1; weighted-recency aggregation is L3.
- Ring-buffer or fixed-window variants — defer if the summary proves insufficient at L3 gating.

### 9.13 Drift emit (L3, Memory ↔ World via instruments)

Primary path:

- When a memory-authored step fails at runtime in a way that indicates the world differs from memory — for example, a facet's top health-ranked locator strategy fails where it previously succeeded — a drift event is written to a `drift-events.jsonl` file: `{ runId, facetId, strategyKind, mismatchKind: 'not-found' | 'role-changed' | 'name-changed' | 'state-mismatch', evidence, observedAt }`.
- Drift events are distinct from product failures; the emitter classifies at emit time.

Obligations at this depth:

- The emitter is the classifier. If classification cannot distinguish drift from product failure at emit time, the event is labeled `ambiguous` rather than guessed.
- Drift events reference facets by stable ID so downstream surfaces (agent session, operator review) can follow the trail.

Deferred:

- Confidence threshold values (how much drift reduces confidence, per mismatch kind). Defer to L3 shipping.
- Per-mismatch-kind recovery policies (auto-propose a facet revision? flag for review? ignore once?) — defer.

### 9.14 Dialog capture, Document ingest, Candidate review (L2, Operator instruments ↔ Memory)

Primary path — sketched:

- **Dialog capture** reads from a chat transcript (Slack export, a chat-harness log, inline MCP messages — whatever shape operator channels take at L2 shipping) and uses a small LLM call to identify domain-informative turns and extract candidate facets. The operator's exact wording is preserved verbatim as provenance; paraphrased summaries do not substitute.
- **Document ingest** reads an operator-shared document (Markdown via `unified`/`remark`, PDF via `pdfjs`, Confluence export, etc.) and extracts candidate facets with anchors to specific document regions (byte offset or header path).
- **Candidate review** surfaces each candidate in a review queue. An operator decision (approve / edit / reject) writes the candidate to memory (approved, with operator attached as additional provenance) or to a rejection log (rejected with rationale preserved).

Obligations at this depth:

- Provenance from dialog includes exact wording and the timestamp of the turn.
- Provenance from documents includes a stable anchor back to the document region.
- Rejected candidates are not forgotten; their rationale conditions later proposals.

Deferred — most specifics:

- Transcript format and chat-harness mechanics — depend on how operator interaction lands at L2 shipping.
- Concrete document parser choices beyond the baselines above.
- Review UI shape — defer entirely; a JSONL queue plus an operator CLI is acceptable at L2.

### 9.15 Confidence age, Corroborate, Revision propose (L4, Memory ↔ itself)

Primary path — sketched:

- **Confidence age** runs as a maintenance pass (idempotent, deterministic) over the evidence logs, applying a decay function to uncorroborated facets.
- **Corroborate** runs as a post-execution hook: a passing test run writes a positive evidence entry to every referenced facet's log.
- **Revision propose** aggregates drift events, decay, and corroboration into a proposal JSONL and surfaces it for operator review.

Obligations at this depth — inherited from §7.8: aging is reversible; corroboration strength is proportional to test reliability; proposals name their evidence.

Deferred — most specifics:

- Decay function shape (exponential, piecewise, evidence-weighted).
- Corroboration weighting (flat, time-weighted, test-reliability-weighted).
- Proposal batching and frequency.

All of these resolve at L4 under customer-specific governance pressure.

### 9.16 Facet schema sketch (shape, not fields)

At L1–L2 scale, a facet carries this load-bearing shape. The exact field set remains deferred per substrate §7; this sketch names what shipping L0–L1 will force into existence. Fields are added, never removed.

```
Facet {
  id              : stable ID, "<screen>:<elementOrConcept>"
  kind            : "element" | "state" | "vocabulary" | "route"
  displayName     : business-layer name ("Save", not "btn-save-1")
  aliases         : operator-observed synonyms, each with its own provenance

  role            : semantic role ("save", "navigate", "input")
  scope           : { screen, surface?, section? }

  locatorStrategies : [ { kind, value, health } ]               // §9.12
  confidence        : present at L1, consumed at L3
  provenance        : { mintedAt, instrument, sessionId, runId? } // §9.9
  evidence          : append-only log reference                   // §9.11
}
```

Kind-specific extensions:

- **Element / affordance** adds `affordance` (the action the element grants — click, fill, select) and `effectState` (the post-condition state name, if the action has one).
- **State** adds `predicates` (the conditions that define the state) and `roleVisibility` (which operator roles can observe it).
- **Vocabulary** adds `surfaceTerm` (what the operator or document called it) and `internalTerm` (the aligned vocabulary the agent uses in test output).

The schema is expected to grow by field addition, not by structural revision. Structural revision is the category of change substrate §6's anti-scaffolding gate applies to most sharply.

## 10) Cross-cutting disciplines

Three disciplines are present at every level and are not features themselves. Every feature must also respect them.

- **Agent fluency.** The vocabulary manifest stays in sync with the instrument and memory verbs by construction, not by convention. Fluency checks run alongside product tests; a change that breaks agent fluency is a regression at the same severity as a broken product test. (Substrate §4.)
- **Handoff boundary.** Tests are visible artifacts but are agent-authored and regeneration-susceptible. Durable QA work lands at the intent or memory layer, and regeneration preserves that partition. (Substrate §3.2.)
- **Anti-scaffolding gate.** Every proposed feature passes "does this help the agent at scale, across many ADO items, for a real customer?" The three patterns that slip a positively-stated gate — unbounded migration scaffolding, dual-master mechanisms, contingent schema without a forcing scenario — are rejected by name. (Substrate §6.)

## 11) Using the ontology to evaluate a proposed feature

Ask, in order:

1. **Which primitive does this feature operate on?** If none — if the feature reshapes the system's internal structure without touching agent behavior on one of the five primitives — it is scaffolding, not a feature. Route to substrate §6.
2. **Which level's claim does this feature help ship?** If the answer is "a level we have not started building," the feature is premature. Defer.
3. **What breaks at its level if this feature is missing?** If nothing breaks — if the level's claim is still shippable without it — the feature is optional. Optional features are acceptable, but only when they earn their place through observed need at the level.
4. **Can this feature be named as a verb the agent calls, with stable inputs and outputs?** If not, the feature is under-specified; name the verb before committing.

If all four questions have answers, the feature belongs. If any does not, the feature is not ready for the ontology — which is the same as saying it is not ready for the codebase.

## 12) Deliberately not here

The following are intentionally absent and are expected to emerge from shipping, not from planning:

- **Exact verb signatures.** The manifest learns them as levels ship.
- **Exact facet schema.** Fields emerge from what L0 and L1 authoring actually need.
- **Exact confidence semantics.** Confidence is written at L1 and consumed at L3; the shape of its order and the threshold values emerge at L3 under the pressure to ship DOM-less authoring, not before.
- **Exact governance for operator oversight.** Lightweight candidate review at L2; revision review at L4; deeper governance emerges only under customer-driven pressure.
- **Fixed feature counts.** The feature lists above name what shipping each level forces into existence. Features accrue only when a level's claim demands them.

Complexity emerges from simpler systems. This ontology maps what the substrate forces into being — nothing more.
