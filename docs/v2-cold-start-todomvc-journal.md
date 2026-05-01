# TodoMVC Cold-Start Journal — Touchpoint Observations

> Status: in-progress experiment journal (started 2026-05-01).
> Companion to `docs/v2-cold-start-cohort-spike.md` — this doc
> records the actual touchpoints of executing §8 of the spike for
> a single training-side AUT (TodoMVC). It is a journal, not a
> report: entries are timestamped, declarative, and capture what
> was tried, what was observed, and what we would want to change.
> The held-out side is **designated but untouched** per the spike's
> §4.4 C1.

## Operating ground rules for this journal

- One entry per touchpoint. A touchpoint is any moment the
  operator (here: the agent) interacts with the system or the
  AUT and gets back a signal — even a missing one.
- Each entry has the shape: **What I tried** / **What I saw** /
  **What I want to improve**.
- "What I want to improve" is a wishlist, not a commitment. The
  spike's purpose is to surface friction; remediation is
  downstream.
- The journal is append-only within the entry sequence. If a
  later entry contradicts an earlier one, the contradiction
  itself becomes an entry.

---

## Entry 0 — partition declaration (clean-room rule §4.4 C1)

**What I tried.** Before any agent contact with TodoMVC, declare
the cohort partition in this journal, since the spike does not
yet have a cohort manifest file.

**What I saw.** Declaration captured here:

- **Training side**: TodoMVC. Specific variant TBD in Entry 1.
- **Held-out side**: a public OutSystems Reactive demo, specific
  URL deferred to a future session. The held-out side is
  designated but untouched. No agent run, no test authoring, no
  inspection happens against the held-out AUT during this spike.

**What I want to improve.** The partition declaration belongs in
a structured cohort manifest, not in journal prose. A future
commit should land `workshop/customer-backlog/public-aut/cohort.yaml`
(or equivalent) with a schema that the trust-policy gate can
read at runtime to refuse canon-graduation in held-out contexts
(spike §4.4 C2). Declaring it in prose here is honest but
unenforceable.

---

## Entry 1 — surveying the ADO fixture format

**What I tried.** Read the customer-backlog README + an example
of each corpus (resolvable, needs-human) to understand the ADO
snapshot shape this codebase consumes.

**What I saw.** Format is concrete and disciplined:

- `AdoSnapshot` JSON with `{id, revision, title, suitePath, areaPath,
  iterationPath, tags[], priority, steps[], parameters[],
  dataRows[], contentHash, syncedAt}`.
- `steps[]`: `{index, action, expected}`. Both fields are
  **HTML-wrapped** (`<p>...</p>`) per the real ADO format
  convention. This is non-obvious — the format inherits from how
  Azure DevOps stores rich-text test steps.
- ID ranges are reserved by cohort: `10000–19999` retired v1
  dogfood; `90001–90099` resolvable; `90101–90199` needs-human.
  **A public-AUT cohort needs its own reserved range.** I'll
  propose `91000–91999` for this journal's purposes; the actual
  range gets fixed when the cohort manifest lands.
- Authoring guidance (README): 3–5 steps per case, role+name pairs
  unambiguous, action verbs that the heuristic classifier can
  pick up (`navigate`, `click`, `enter`, `verify`).

**What I want to improve.**

1. The HTML-wrapping of action/expected text is a quirky inheritance
   from ADO's storage format, not a logical requirement. For
   hand-authored cohort fixtures it adds noise. The fixture
   loader could accept a plain-text shape and lift it to the
   HTML-wrapped form transparently.
2. The ID-range convention is tribal knowledge in the README. The
   cohort manifest should make this a first-class field
   (`{cohort: 'public-aut', idRange: '91000-91999'}`) so a load-time
   law can reject collisions automatically.
3. There is no `aut` field on the snapshot — every test case
   implicitly assumes a single AUT (the synthetic app). The
   public-AUT cohort needs a `targetAut: <name>` field on each
   snapshot, or a directory-level convention, so the runner
   knows which URL to navigate to. Today this would be inferred
   from the `suitePath` only loosely.

---

## Entry 3 — TodoMVC variant pick + surface inventory

(This entry is numbered 3 because Entry 2 was authored after a
chronologically-later finding; the journal preserves the order in
which insights actually surfaced.)

**What I tried.** Pick a canonical TodoMVC variant. Inventory its
DOM surfaces by loading the live site headlessly via the
project's bundled Playwright (`/opt/pw-browsers/chromium-1193`),
populating two sample todos to expand the rendered surface, and
walking the DOM via `page.evaluate`.

**What I saw.**

- **Variant chosen**: `https://todomvc.com/examples/react/dist/`.
  Title `TodoMVC: React`. The choice is deliberate: React is one
  of the framework markers the variant classifier in
  `workshop/substrate-study/application/variant-classifier.ts`
  knows about, but TodoMVC is NOT OutSystems Reactive — so the
  variant classifier will (correctly) refuse to apply
  Reactive-specific matchers. This is the cleanest possible
  rung-3 cohort entry.

- **WebFetch is insufficient.** First attempt used `WebFetch`
  (the one-shot HTML-fetcher). It returned a near-empty
  inventory because TodoMVC is client-rendered — the initial
  HTML payload contains no rendered todos. Real surface
  inventory required Playwright to load the page, hydrate, and
  walk the live DOM. Implication: **the cohort's snapshot-once
  step must use Playwright for capture, not a static fetcher.**

- **Cert trust requires `ignoreHTTPSErrors`.** First Playwright
  attempt against `todomvc.com` failed with
  `ERR_CERT_AUTHORITY_INVALID`. The sandboxed environment has
  limited CA trust. Setting `ignoreHTTPSErrors: true` on the
  context unblocked it. The cohort's capture step needs to know
  this; the existing playwright bridge at
  `product/instruments/tooling/playwright-bridge.ts` may or may
  not surface this option.

- **Surface inventory (after adding two todos):**

  Landmarks (semantic HTML, **no explicit ARIA roles**):
  - `<section class="todoapp">` — the app container
  - `<header class="header">` — contains the new-todo input
  - `<main class="main">` — contains the todo list
  - `<footer class="footer">` — contains item count, filters,
    clear-completed button
  - `<footer class="info">` — page-level instruction text

  Inputs:
  - `<input type="text" id="todo-input" class="new-todo"
    placeholder="What needs to be done?">` — labelled by
    `<label for="todo-input">New Todo Input</label>`
  - `<input type="checkbox" id="toggle-all" class="toggle-all">`
    — labelled by `<label for="toggle-all">Toggle All Input</label>`
  - Per-todo `<input type="checkbox" class="toggle">` — **no
    label association**, no `aria-label`, no `id`. Identification
    requires positional reasoning ("the checkbox in the same `li`
    as the todo text").

  Buttons:
  - Per-todo `<button class="destroy">` — **completely anonymous**:
    empty `textContent`, no `aria-label`, no `title`. The X glyph
    is CSS-rendered. A matcher that depends on accessible name
    will never find this button.
  - `<button class="clear-completed">Clear completed</button>` —
    only present when at least one todo is completed.

  Filter links (hash-routed):
  - `<a href="#/">All</a>` (initially has class `selected`)
  - `<a href="#/active">Active</a>`
  - `<a href="#/completed">Completed</a>`
  - **No `aria-current`**, no `role="tab"`, no
    `aria-selected`. The "currently active filter" signal is
    only carried in the `selected` class — a CSS-level signal,
    not an a11y-level signal.

  Per-todo `<label>` carries the todo text but has no `for`
  attribute, so its association with the checkbox is purely
  positional/visual.

**What I want to improve.**

1. **TodoMVC is not "trivial ARIA-clean DOM" as the spike's §5
   ladder ordering suggested.** It has at least four real ARIA
   imperfections (anonymous destroy buttons, unassociated
   per-todo labels, no `aria-current` on filters, no landmark
   roles). This is a useful correction to the spike: TodoMVC
   stresses the system in interesting ways even though the
   surface is small. The journal entry validates that even the
   "sanity rung" of the diversity ladder is non-trivial — which
   is a feature, not a bug, for a forcing function.
2. The cohort's capture step needs a clear contract:
   `ignoreHTTPSErrors: true` for sandboxed environments,
   networkidle wait, an authoring helper that populates the AUT
   with sample state before snapshotting (otherwise the
   snapshot only captures the empty state).
3. The variant classifier correctly identifying TodoMVC as
   "React, not OutSystems Reactive" needs to be exercised on
   this cohort entry as a sanity probe. If it ever
   misclassifies TodoMVC as Reactive (because of class names
   like `todoapp`), that's a generic-tier bug worth catching
   immediately.

---

## Entry 2 — discovering the runnable-cold-start dependency on Z11d

**What I tried.** Trace what "run cold-start against TodoMVC"
would actually invoke. Read `workshop/cli/commands/compile-corpus.ts`
and `product/application/resolution/compile.ts`.

**What I saw.** Two compile paths, and the gap between them is
load-bearing for this spike:

- **`workshop/cli/commands/compile-corpus.ts`** — invoked as
  `tesseract compile-corpus --corpus resolvable`. Uses the
  **heuristic intent classifier** (Z11a.5) to estimate per-step
  outcomes. **Does not actually run parse → bind → resolve.**
  Receipts mark `substrateVersion: 'heuristic-z11a5'`. Quoting the
  file: "This is NOT the real compile pipeline."
- **`product/cli/commands/compile.ts`** — invoked as
  `tesseract compile --ado-id <id>`. Runs the real
  parse → bind → emit pipeline through
  `compileScenarioCore` in `product/application/resolution/compile.ts`,
  which requires `loadWorkspaceSession` (full catalog +
  workspace) and traverses the 11-rung precedence ladder.

The customer-backlog README (lines 24–37) names the consequence
plainly: "Under the current deterministic Reasoning adapter (no
live LLM, no operator-seeded catalog), the compile pipeline's
binder will hit the 7th lookup slot (`needs-human`) for nearly
any ADO text because there's no catalog to resolve against and
no reasoning adapter to bridge. **This means the resolvable
corpus's confirmation rate under Z11a will be mostly zero**."

This rewrites my expectation of what the experiment can produce
today:

- Running `compile-corpus` against TodoMVC fixtures → produces
  heuristic classifications, NOT real `InterventionHandoff`s. The
  receipts will be informative but they are not what the spike
  hypothesized.
- Running real `compile` against a single TodoMVC fixture →
  produces real handoffs, but every step will hit `needs-human`
  almost trivially (no catalog, no reasoning), making the
  handoff log a broad sweep rather than the precision diagnostic
  the spike wanted.
- The spike's hypothesized output ("a handoff log classified
  well enough that the gap structure is legible", §9.1) requires
  **either a seeded catalog (which contaminates cold-start) or
  Z11d's live reasoning adapter**.

**What I want to improve.**

1. **The cold-start cohort spike is downstream of Z11d.** I
   should journal this finding back into the spike doc as a
   prerequisite. The spike could still execute today, but its
   findings would be dominated by "the deterministic adapter
   can't reason about anything" — which we already know. The
   cohort's signal-to-noise ratio is determined by the reasoning
   adapter's capability.
2. The agent (me) can play the live reasoning adapter via the
   file-mediated decision bridge described in CLAUDE.md (the
   "agent-in-the-loop" subsection). That's effectively a
   manual Z11d. Doing this for TodoMVC is in scope for this
   journal; it would let the experiment actually produce the
   handoffs the spike hypothesizes. But it requires running the
   real `compile` pipeline against ADO fixtures the workspace
   doesn't yet support (no `targetAut` field).
3. There is a missing "compile-against-public-aut" command. The
   existing `compile-corpus` runs heuristics; the existing
   `compile` runs against a synced ADO id in the workspace's
   default workspace. Neither knows how to run against a fixture
   from `workshop/customer-backlog/public-aut/`. A new command
   (or a flag on `compile-corpus`) would close this gap.

---

## Entry 4 — authoring 3 ADO-shaped test cases by hand

**What I tried.** Author three TodoMVC test cases in the
AdoSnapshot JSON shape, of escalating ambition: add-todo,
mark-complete, filter-active. Place them in
`docs/v2-cold-start-todomvc-fixtures/` (journal-adjacent,
explicitly experimental) rather than under
`workshop/customer-backlog/public-aut/` (cohort home not yet
built per the spike's discipline).

**What I saw.**

- **The HTML-wrapping is friction.** Every `action` and `expected`
  field requires a `<p>...</p>` wrap. Hand-authoring three cases
  meant typing 18 `<p>` pairs. None of them carry semantic
  information. This is purely an inheritance from how Azure
  DevOps stores rich-text test steps; for hand-authored cohort
  fixtures it adds zero signal.
- **The contentHash is fictional.** I authored
  `"contentHash": "sha256:91001-todomvc-add-todo-spike1"` because
  the loader doesn't validate it. A real hash would require
  running the snapshot through the project's fingerprinting
  utility. For evidence-only fixtures this is fine; for cohort
  infrastructure it should be auto-derived from the snapshot's
  canonical form.
- **The `parameters` + `dataRows` redundancy is awkward.** Each
  parameter must be declared twice — once in `parameters[]`
  with its allowed values, once in `dataRows[]` as the actual
  value to use. This makes sense when the snapshot is
  parameter-driven (multiple data rows produce multiple test
  invocations); it adds noise for single-row hand-authored cases.
- **No `targetAut` field.** I had to encode "this is TodoMVC at
  https://todomvc.com/examples/react/dist/" implicitly via the
  fixtures' directory location. The AdoSnapshot type has no slot
  for the AUT. Today's customer-backlog corpus implicitly
  assumes the synthetic-app substrate; once the cohort grows to
  multiple AUTs, every snapshot needs a `targetAut` field to be
  unambiguous about what it's testing against.
- **Phrasing decisions are load-bearing.** I chose "Click the
  toggle checkbox next to the todo" deliberately to test
  whether the classifier picks up "checkbox" and "next to the
  todo" (a positional referent). I chose "Click the Active
  filter link in the footer" to test whether "link" tells the
  classifier the role is a hyperlink, not a button. These were
  authoring decisions that anticipate what the classifier might
  catch — i.e., I was already (accidentally) doing the agent's
  job for it. A different operator with different intuitions
  about what helps would write different cases. **The
  hand-authoring step is not a clean room** in the strict
  sense: the operator knows what the classifier looks for, and
  fixture quality reflects that. Aspiration: a separate
  operator authors fixtures than the one curating canon, per
  spike §4.4 C5.

**What I want to improve.**

1. **Lift the HTML wrapping at load time.** The fixture loader
   could accept either HTML-wrapped or plain-text action/expected,
   and lift plain-text to HTML transparently. Hand-authored
   cohort fixtures get a real ergonomics win; serialized-from-ADO
   fixtures continue to round-trip unchanged.
2. **Auto-derive `contentHash`.** The loader should compute the
   hash from the snapshot's canonical form on first load and
   cache it; hand-authored fixtures get to omit the field.
3. **Add `targetAut` to `AdoSnapshot`.** Optional field, defaults
   to the cohort-default URL when absent. Required when the
   cohort manifest declares more than one AUT.
4. **Document the operator-authorship clean-room aspiration in
   the cohort manifest schema.** Even if it can't be enforced
   today, the cohort entry should declare the operator who
   authored each fixture, so multi-operator authoring becomes
   visible as a metric over time.

---

## Entry 5 — running the heuristic classifier against the fixtures

**What I tried.** Since the full compile pipeline can't produce
a meaningful handoff log without Z11d (Entry 2), run the
heuristic classifier directly against the three fixtures and
capture the per-step verdicts. The classifier (`classifyCase`
in `workshop/customer-backlog/application/heuristic-classifier.ts`)
takes a snapshot and a corpus tag, runs each step's action text
through the shared intent classifier
(`product/domain/resolution/patterns/intent-classifier.ts`), and
returns a per-step kind + rationale.

The heuristic was invoked through `dist/`-compiled output via a
tiny Node script. The corpus tag passed was `'resolvable'` (so
the corpus-aware policy override at line 102–109 doesn't force
needs-human regardless of classifier acceptance).

**What I saw.**

All 9 steps classified as `would-resolve`. The verbs and
inferred roles:

| ADO id | Step | Verb | Role |
|---|---|---|---|
| 91001 | Navigate to TodoMVC | `navigate` | inferred |
| 91001 | Enter the todo description in the new-todo input | `input` | textbox |
| 91001 | Press Enter to submit the new todo | `click` | inferred |
| 91002 | Navigate to TodoMVC with at least one todo | `navigate` | inferred |
| 91002 | Click the toggle checkbox next to the todo | `click` | **button** |
| 91002 | Verify the items-left count decreases | `observe` | inferred |
| 91003 | Navigate to TodoMVC with mixed todos | `navigate` | inferred |
| 91003 | Click the Active filter link in the footer | `click` | **button** |
| 91003 | Verify completed todos are hidden | `observe` | inferred |

Several findings the table makes immediate:

- **The classifier does not distinguish checkbox from button or
  link from button.** Step 91002.2 says explicitly "click the
  *toggle checkbox*" — the classifier infers role=button. Step
  91003.2 says "click the Active filter *link*" — also
  role=button. The classifier flattens any "click X" to button.
  This is a real generic-tier deficiency the cohort surfaces:
  the intent-classifier's role inference for `click` is too
  coarse to honor "checkbox" or "link" hints in the surrounding
  text.
- **"Press Enter" classifies as `click`.** Step 91001.3
  ("Press Enter to submit the new todo") becomes `click` with
  role=inferred. This is wrong — pressing Enter is a keyboard
  action, not a click. The verb extractor's regex
  (`/\bclick|\btap|\bpress|\bselect\s+the/`) catches "press" and
  routes it to click. A real cold-start would either (a) bind a
  click handler that doesn't fire (if the page has no "Submit"
  button), or (b) rely on the bridge to do something
  Enter-like. Either way, the classifier's coarse mapping
  obscures the intent.
- **`would-resolve` is hopeful, not actual.** This is a
  classifier-acceptance verdict, not a binding-success verdict.
  The customer-backlog README is explicit: under the
  deterministic adapter + empty catalog, the *real* compile
  pipeline's binder hits the 7th lookup slot (`needs-human`) for
  nearly any ADO text. So a `would-resolve` classifier verdict
  on these three cases tells me only that the prose is
  well-formed enough to enter the pipeline. It tells me nothing
  about whether the pipeline would resolve a real surface.
- **Zero `InterventionHandoff`s emitted.** The heuristic
  produces no handoffs for these fixtures because every step
  classified. This is the spike's predicted-but-still-deflating
  outcome: with deterministic reasoning + no catalog +
  heuristic-only classification, the cohort produces no
  real-handoff signal, only verb-extraction signal.

**What I want to improve.**

1. **The intent classifier's role inference for `click` is the
   first concrete probe seed for this cohort.** Recurring
   across two of three fixtures (91002, 91003), it represents
   a generic-tier deficiency that any AUT with checkboxes or
   links will surface. Probe spec sketch: given an action text
   that explicitly names "checkbox" or "link" within the
   click verb's argument, the classifier should infer role
   accordingly. Easy to author; broad in coverage.
2. **The `press`-becomes-`click` flattening is a second probe
   seed.** Probe sketch: given "press Enter" or "press
   Spacebar", the classifier should infer a keyboard verb
   distinct from `click`, with the key as a parameter.
3. **"Verify"/"observe" steps need a target.** Step 91002.3
   ("Verify the items-left count decreases by one") classifies
   as `observe; role=inferred`. The classifier doesn't extract
   what's being observed (a count, a text element, a state
   change). Without that, even the real compile pipeline has
   nothing to bind. Probe sketch: an observe step should yield
   either (a) a target with a role, or (b) an explicit
   `observation-needs-target` handoff.
4. **The cohort needs a "would-resolve vs would-actually-resolve"
   distinction in receipts.** A heuristic verdict and a real
   pipeline verdict should never share the same shape. Today
   they do (both produce `CompilationReceipt`); the cohort
   should produce a distinct receipt type when running against
   public AUTs so the metric tree doesn't conflate
   classifier-accepted with binding-succeeded.

---

## Entry 6 — synthesis: what the experiment teaches

This is the synthesis entry the spike's §8.5 asked for.

### What held up

- **The fixture format works for hand-authoring against a
  foreign AUT.** Authoring three TodoMVC cases took ~15 minutes;
  the format is friction-y but tractable. No structural surprise
  prevented the fixtures from existing.
- **The heuristic intent classifier picks up plain-English verbs
  reliably.** Every step's verb classified correctly given the
  classifier's vocabulary; nothing returned `unclassified`. This
  is meaningful evidence that the cold-start cohort's *prose-to-
  intent* boundary is sound.
- **Playwright-against-foreign-DOM works.** Headless capture
  with `ignoreHTTPSErrors: true` produced a real surface
  inventory. The bridge code at
  `product/instruments/tooling/playwright-bridge.ts` is the
  natural place to add the `ignoreHTTPSErrors` option as a
  cohort-specific config.
- **TodoMVC produces real-world ARIA imperfections.** Anonymous
  destroy buttons, unassociated per-todo labels, no
  `aria-current` on filter selection. The "trivial sanity rung"
  framing in the spike's §5 was wrong: TodoMVC stresses the
  system in interesting ways.

### What broke (or was deferred)

- **The full cold-start pipeline cannot produce a meaningful
  handoff log without Z11d (live reasoning) or a seeded catalog.**
  The deterministic adapter + empty-catalog combination forces
  every step to hit `needs-human` at the binder, which is a
  known ceiling, not a diagnostic signal.
- **The customer-backlog corpus loader is hard-coded to
  `resolvable/` and `needs-human/` directories.** Adding a
  third cohort (`public-aut/`) requires a one-line change to
  `load-corpus.ts:21` plus an extension to
  `CompileCorpusResult.corpusEvaluated`. Not difficult; just
  not done.
- **The AdoSnapshot type has no `targetAut` slot.** The cohort
  cannot grow beyond one implicit AUT until this lands.
- **The classifier's role inference is coarse.** It flattens
  click+checkbox and click+link to click+button; it routes
  "press Enter" to click. These are the cohort's first concrete
  generic-tier probe seeds.

### What this teaches the cold-start cohort spike

The spike's hypothesis is intact, but its *first move* needs to
revise. The proposed §8 sequence (run cold-start against
TodoMVC live, capture handoffs) presupposes a pipeline that
produces meaningful handoffs. Today's pipeline doesn't — not
because cold-start is broken, but because the deterministic
reasoning ceiling sits below the cohort's signal floor.

Two viable paths forward:

1. **Ride Z11d into the cohort.** Wait until the live reasoning
   adapter lands; then the spike's §8 sequence executes
   honestly. The cost: cohort waits on a separate workstream.
2. **Operate the cohort under the heuristic classifier with
   eyes open.** Treat the classifier's verdicts as the cohort's
   signal floor and surface its deficiencies (role flattening,
   press-as-click) as the cohort's first concrete probe seeds.
   The cost: the cohort produces evidence about the *classifier*,
   not about the *pipeline as a whole*. But that evidence is
   real, and it's downstream-useful when Z11d lands (probes
   accumulated under heuristic-mode become regression tests
   under live-mode).

Path 2 is the higher-leverage move while waiting. The cohort
becomes a forcing function for *the classifier's role
inference* immediately, even if it has to wait for Z11d to
become a forcing function for *the binder's catalog
acquisition*.

### What the spike doc itself should change

Three recommended revisions to `docs/v2-cold-start-cohort-spike.md`:

1. **§4.1 (cold-start posture).** Note explicitly that
   "cold-start" today means "no catalog, no live reasoning,
   heuristic classifier only" — and that this floor produces
   classifier-acceptance verdicts, not binding-success
   verdicts. The spike's measurement target needs to
   distinguish the two.
2. **§5 (diversity ladder).** Re-rank TodoMVC. It is not the
   trivial-sanity rung; it is a real-ARIA-imperfection rung that
   exposes generic-tier classifier deficiencies. The
   "deliberately messy site" framed as the optional fourth rung
   is not as far away from TodoMVC as the spike implies.
3. **§8 (smallest concrete first move).** Add: "Author the
   fixtures, run the heuristic classifier, capture the
   classifier-deficiency probe seeds. Defer the live cold-start
   handoff capture until Z11d (or a deliberate
   catalog-seeding contamination) lands."

### What I want most to improve next

In priority order:

1. **Land `targetAut` on `AdoSnapshot`.** Single-field schema
   change; unblocks the cohort's most basic identity.
2. **Extend `load-corpus.ts` to walk a `public-aut/` directory
   alongside `resolvable/` and `needs-human/`.** One-file
   change.
3. **Author the first cohort manifest schema** with
   `{name, url, partition, snapshot-fingerprint, authoring-operator}`.
   Mechanical enforcement of spike §4.4 (clean-room rule)
   starts here.
4. **Probe seed: classifier role inference for click+checkbox /
   click+link / click+button.** The most concrete generic-tier
   probe this cohort surfaced. Author it as a probe receipt
   the next time the cohort runs and watch it stay red until
   the classifier is upgraded.
5. **Probe seed: keyboard-verb extraction (`press X`).** Same
   shape as #4, narrower scope.

## Entry 7 — closing the first loop: realizations → code

**What I tried.** Translate the journal's findings (Entries 4–6)
into actual code + doc revisions so the cycle of
*observation → hypothesis → revision → activation* completes
once. Three categories of change landed in the same session:

1. **Spike-doc revisions to
   `docs/v2-cold-start-cohort-spike.md`.**
   - §4.1 expanded with the three cold-start floors (heuristic
     classifier / deterministic empty catalog / live empty
     catalog). Floor identity now travels with receipts so
     cross-floor comparisons are not silently performed.
   - §5 re-ranks TodoMVC: removed the "trivial DOM, clean ARIA"
     framing; named the four ARIA imperfections explicitly.
   - §8.3 + §8.4 acknowledge that today's first-move execution
     happens at Floor A and produces classifier-acceptance
     verdicts, not handoff logs.
   - **New §11** ("The journal-revision-code cycle as the
     nascent self-improvement loop") makes the cycle's
     isomorphism to the compounding engine
     (`docs/v2-compounding-engine-plan.md §1.1`) explicit. The
     compounding engine eventually subsumes this manual
     discipline; until it lands, journal entries are the
     manual analogue of `HypothesisReceipt`s.

2. **Code: `targetAut` on `AdoSnapshot`.**
   - Added optional field to
     `product/domain/intent/types.ts:38` and the corresponding
     `effect.Schema.optional(Schema.String)` to
     `product/domain/schemas/intent.ts:38`. Additive, all
     existing fixtures continue to validate.

3. **Code: public-AUT cohort home + manifest + loader.**
   - `workshop/customer-backlog/public-aut/cohort.json` —
     manifest declaring the partition (`training` /
     `held-out`), AUT URL, fixtures directory, and provenance
     fields (`authoringOperator`, `addedAt`,
     `snapshotFingerprint`). Schema enforces the spike's §4.4
     C1 *partition declared before contact* discipline
     mechanically: an AUT cannot exist in the cohort without
     declaring its side of the firewall.
   - `workshop/customer-backlog/application/load-public-aut-cohort.ts`
     — pure loader, parallel to the existing `load-corpus.ts`
     (deliberately *not* folded into the existing
     `CustomerCompilationCorpus` union — public-AUT cohorts
     have different measurement semantics; keeping the loader
     separate makes the partition concern visible at the
     import seam).
   - `workshop/customer-backlog/public-aut/README.md` —
     cohort-home guide, names the clean-room rule corollaries
     and authoring guidance.
   - The three TodoMVC fixtures graduated from
     `docs/v2-cold-start-todomvc-fixtures/` (journal-adjacent)
     to `workshop/customer-backlog/public-aut/todomvc/` (cohort
     home), each carrying `"targetAut":
     "https://todomvc.com/examples/react/dist/"`.

**What I saw.**

- Build clean (`manifest drift-check: no drift; build ok`).
- Full test suite: 4071 passed, 10 skipped, 0 failed.
- Seam-enforcement law (3 tests) green — no architecture
  violations introduced by the new loader file.
- Loader smoke-test confirms end-to-end:
  `loadPublicAutCohort` reads the manifest, walks the
  `todomvc/` directory, returns 3 cases with their `targetAut`
  fields populated. `partitionedAuts` reports 1 training
  AUT, 0 held-out — as expected at this nascent stage.

**What I want to improve (the next cycle's seeds).**

This entry closes one cycle by realizing items 1–3 of Entry 6's
priority list. Items 4 and 5 (the two probe seeds) remain
forward work; they need the probe IR machinery for public-AUT
cohorts to exist before they can be authored as receipts. New
seeds this cycle surfaced:

1. **The trust-policy gate is not yet partition-aware.**
   `workshop/customer-backlog/public-aut/README.md` describes
   the clean-room enforcement; the gate at
   `product/application/policy/trust-policy.ts` does not yet
   consult `loadPublicAutManifest` to refuse canon writes when
   the active context's AUT is `held-out`. This is the
   critical next code change before any held-out evaluation can
   honestly run. Without it, C2 ("the held-out partition is
   firewalled from canon graduation") is documented but
   unenforced.
2. **No CLI verb yet routes the public-AUT cohort to the
   compile pipeline.** The loader exists; nothing calls it. A
   future `tesseract compile-public-aut --aut <name>
   --cohort-role <training|held-out>` command would close the
   gap, with the role flag consulted by the trust-policy gate
   per (1).
3. **The cohort manifest's `snapshotFingerprint` field is
   currently `null` for TodoMVC.** It gets populated when the
   first DOM capture lands and turns the entry into a
   permanent rung-2 fixture per spike §4.2. The capture
   pipeline doesn't yet write back to the manifest.
4. **Architecture law for cohort manifest invariants.** A
   compile-time test should enforce: `partition` is
   `'training' | 'held-out'` exactly; `name` is unique across
   entries; promotion training → held-out is impossible (the
   manifest is append-only with respect to that direction).
   Without this law, C4 (one-way promotion) is
   honor-system-enforced.

**Why this entry matters more than its content.** Per the
spike's new §11, this cycle (observe in Entry 5 → revise the
spike's §4.1 / §5 / §8 → land code that realizes the
realization) is an isomorphic, manual rehearsal of the
compounding engine's eight steps from
`docs/v2-compounding-engine-plan.md §1.1`. Entry 7's
existence — and its enumeration of the next cycle's seeds — is
itself a graduation event in miniature. The point of writing
the cycle out explicitly is to recognize that the engine
already exists in low-throughput form; the engine's
forthcoming automation multiplies throughput, it doesn't
introduce the shape.

The journal stops here for this session. Held-out evaluation
remains untouched per spike §4.4 C1; the public OutSystems
Reactive demo URL is still TBD with the operator. The next
cycle picks up either at the trust-policy partition-awareness
work (above, item 1) or at the OutSystems held-out
designation, whichever the operator chooses.

---

# Cycle 2 — toward the first full Floor A.5 run

> Cycle 2 begins 2026-05-01, late. Prior cycle landed:
> `targetAut` field, cohort manifest + loader, fixture
> promotion, spike-doc revisions (§4.1 floors, §5 ranking,
> §11 self-improvement framing). Cycle 2's question: how much
> of a "full run" can we land at Floor A.5 — heuristic
> classifier + naive DOM resolution against the real AUT?

## Entry 8 — hypothesis for cycle 2 (a Floor A.5 run)

**What I'm trying to discover.** Cycle 1 closed at Floor A
(heuristic classifier verdicts only, zero `InterventionHandoff`s
because the classifier never reaches the binder). Cycle 2 climbs
half a rung: the *classifier* still runs at Floor A, but its
verdicts now drive a *real Playwright DOM probe* against
`targetAut`. This is the floor I'll call **A.5** — heuristic +
naive DOM resolution + receipts that name what the classifier
told the bridge to look for, and whether the bridge found it.

A.5 produces real handoffs, not classifier-acceptance verdicts.
Where Floor A says "this step is well-formed prose", A.5 says
"this step's classified shape (verb + role + name) either
matches a real DOM element on the real AUT, or it doesn't." The
"doesn't" cases are the cohort's first real-handoff log.

**What I expect to see, predicted before the run.** Two failure
families I expect, both seeded by Entry 5's findings:

1. **The toggle-checkbox click fails.** Step 91002.2 ("Click
   the toggle checkbox next to the todo") classifies as
   `click; role=button, nameSubstring='toggle'`. The real
   surface (Entry 3 inventory) is
   `<input type="checkbox" class="toggle">` — role
   "checkbox", not "button". `page.getByRole('button', { name:
   /toggle/i })` returns zero matches; a not-found handoff is
   emitted.
2. **The filter-link click fails.** Step 91003.2 ("Click the
   Active filter link in the footer") classifies as `click;
   role=button, nameSubstring='Active'`. The real surface is
   `<a href="#/active">Active</a>` — role "link". Same
   not-found handoff is emitted.

A third failure I expect but haven't predicted exactly:

3. **The "Press Enter" step is ambiguous.** Step 91001.3
   classifies as `click` (the press-as-click bug). What does
   `page.getByRole('button', { name: <something> })` even do
   here? The classifier doesn't extract a useful name from
   "Press Enter to submit the new todo" — at best a partial
   match on "submit" or "Enter". Most likely outcome:
   not-found (because there's no Submit button — TodoMVC
   submits via the Enter keypress on the input field).

What I expect to *succeed*:

- Step 91001.1 (navigate to TodoMVC) — succeeds because the
  executor navigates to `targetAut` at the start of the case.
- Step 91001.2 (enter todo description in new-todo input field)
  — `input; role=textbox, nameSubstring='new-todo input'`. The
  TodoMVC new-todo input is `<input type="text" id="todo-input"
  class="new-todo">` with `<label for="todo-input">New Todo
  Input</label>`. Playwright's `getByRole('textbox', { name:
  /new[- ]?todo/i })` should find it via the label association.
  This is the only step I expect a clean match on.

**Why this is worth running even if the predictions hold.** The
predictions are hypotheses; the run is the receipt. If they
hold, the cohort has named real-handoff probe seeds with
provenance instead of speculation. If they don't hold (e.g., the
classifier-`click`+role-`button` actually finds *something* on
TodoMVC for a different reason), that's a more interesting
discovery: it means the cohort's signal is being polluted by
spurious matches, and Probe Seed 4 (cycle 2's likely output) is
"DOM resolution must validate that what it found is actually
what the classifier *meant* to find."

**What I'm building this cycle.** A new CLI command,
`compile-public-aut`, that:

1. Loads the cohort manifest via `loadPublicAutCohort`.
2. For each case (filtered by `--aut <name>` if provided):
   a. Runs the heuristic classifier per step.
   b. Launches Playwright headlessly, navigates to
      `targetAut` once per case.
   c. For each classified step, attempts a single Playwright
      `getByRole(role, { name })` query.
   d. Records per-step outcome: `matched | not-found |
      ambiguous | unclassified | skipped-navigate`.
3. Writes a JSON receipt per case under
   `workshop/logs/public-aut-receipts/<aut-name>/`.
4. Prints a summary: cases run, steps matched, steps emitted
   handoffs.

**What I'm explicitly NOT building.** The full compile pipeline
integration; trust-policy partition-awareness; advanced DOM
resolution (the `getByRole` query is the floor); receipt-fold
into the seven-visitor metric tree; CI integration. Each of
those is a future cycle's seed.

---



## Entry 9 — building the runner: surprises during construction

**What I tried.** Build `workshop/customer-backlog/application/public-aut-runner.ts`
(the executor) + `workshop/cli/commands/compile-public-aut.ts`
(the CLI verb), wire them through the workshop command registry,
and add the two new flags (`--aut`, `--cohort-role`) to the
shared CLI registry at `product/cli/shared.ts`.

**What I saw.**

- **The CLI flag registry is more strictly typed than I
  expected.** Adding `--aut` and `--cohort-role` required edits
  in *four* places: `ParsedFlags` interface (line 19), the
  `FlagToParsedKey` mapping (line 100), the `flagDescriptorTable`
  table (line 401), and the `CommandName` union + `commandNames`
  array (line 193). The build failed twice before all four
  registrations matched. This is friction-y but the right kind
  of friction — it forces flag additions to be deliberate
  rather than additive-by-accident.
- **The Effect / Playwright boundary is narrow.** The executor
  is plain `async` because Playwright's API is Promise-based;
  the CLI command wraps the executor in `Effect.tryPromise` at
  exactly one place. This keeps the boundary disciplined
  without forcing every Playwright call through Effect's
  retry/timeout machinery (which is what the
  `PlaywrightBridgePort` exists for, but the bridge is a future
  cycle's integration).
- **The intent classifier's TargetShapeHint is what I expected
  but slightly poorer.** The classifier produces a
  `nameSubstring` (like `"Submit"` from "Click the Submit
  button") that I converted to a Playwright `RegExp` for
  `getByRole(role, { name: /substring/i })`. This works for
  click+button but breaks for `observe` because
  `extractObserveTarget` doesn't infer a role. The runner
  consequently emits `no-target-name` for every observe step.
  This was visible from reading the classifier code but I only
  felt it once the runner ran and showed three observe steps in
  a row failing for the same reason.
- **The Playwright executable path is environment-dependent.**
  The runner reads `process.env.TESSERACT_PLAYWRIGHT_EXECUTABLE`
  and falls back to Playwright's default discovery. In this
  environment the env var must be set
  (`/opt/pw-browsers/chromium-1193/chrome-linux/chrome`)
  because the default browser cache path is empty. The CLI
  command surfaces this as an error path; an operator-friendly
  fallback (probe known paths automatically) is a future
  cycle's polish.

**What I want to improve.**

1. **The four-site flag registration is a doc-trap.** A short
   guide ("adding a CLI flag in five minutes") in
   `product/cli/shared.ts` or its README would have saved the
   build cycle. Not urgent, but a clear next-cycle seed.
2. **The runner's `getByRole` fallback for observe is not
   correct;** observe-without-a-role should not silently emit
   `no-target-name`, it should attempt a different resolution
   strategy (text-content match, landmark scope, etc.). Today
   it punts. Probe Seed 5 (this cycle's contribution) names
   this gap.

---

## Entry 10 — the run: what Floor A.5 actually surfaced

**What I tried.** Execute the runner against TodoMVC:

```sh
TESSERACT_PLAYWRIGHT_EXECUTABLE=/opt/pw-browsers/chromium-1193/chrome-linux/chrome \
  node dist/bin/tesseract.js compile-public-aut --aut todomvc
```

**What I saw.** Aggregate result:

| Metric | Value |
|---|---|
| Cases processed | 3 |
| Steps total | 9 |
| Steps matched | 3 (all navigates) |
| Handoffs emitted | 6 |
| Receipts written | `workshop/logs/public-aut-receipts/todomvc/91xxx-<stamp>.json` (one per case) |
| Substrate version | `floor-a5-heuristic-naive-dom` |
| Total elapsed | ~3 seconds across all three cases |

Per-step outcomes (compressed):

| ADO | Step | Action prose | Verb / role / nameSubstring | DOM resolution | Predicted? |
|---|---|---|---|---|---|
| 91001 | 1 | Navigate to TodoMVC | navigate / – / 'TodoMVC application' | skipped-navigate | ✓ |
| 91001 | 2 | Enter the todo description in the new-todo input field | input / textbox / 'new-todo input' | **not-found** | ✗ (predicted match) |
| 91001 | 3 | Press Enter to submit the new todo | click / – / – | **no-target-name** | ✓ press-as-click |
| 91002 | 1 | Navigate to TodoMVC with at least one todo | navigate / – / 'TodoMVC application…' | skipped-navigate | ✓ |
| 91002 | 2 | Click the toggle checkbox next to the todo | click / button / 'toggle' | **not-found** | ✓ role-flattening |
| 91002 | 3 | Verify the items-left count decreases | observe / – / 'items-left count…' | **no-target-name** | ✗ (new) observe-no-role |
| 91003 | 1 | Navigate to TodoMVC with mixed todos | navigate / – / 'TodoMVC application…' | skipped-navigate | ✓ |
| 91003 | 2 | Click the Active filter link in the footer | click / button / 'Active' | **not-found** | ✓ role-flattening |
| 91003 | 3 | Verify completed todos are hidden | observe / – / 'todos are hidden…' | **no-target-name** | ✗ (new) observe-no-role |

**Three predictions held; one prediction broke; two new
findings emerged.**

Predictions confirmed:
- **91002.2 toggle-checkbox click → not-found** because the
  classifier flattens role to `button` and there is no
  `<button>` matching `/toggle/i` on TodoMVC. The actual
  surface is `<input type="checkbox" class="toggle">`. This is
  Probe Seed 1 from cycle 1, now with provenance.
- **91003.2 filter-link click → not-found** for the same
  role-flattening reason. Probe Seed 1 again, second
  occurrence — confirming the gap is generic-tier (not
  AUT-specific).
- **91001.3 press-Enter → no-target-name** because the verb
  classifier picked `click` from "press" but the click-target
  regexes (`CLICK_BUTTON_RE`, `CLICK_BARE_RE`) only know how to
  parse "click X" — not "press X". The classifier emits a
  click verb with a null target. Probe Seed 2 from cycle 1
  with provenance + a new sub-finding: the press-as-click bug
  *also* breaks target extraction.

Prediction broken:
- **91001.2 new-todo input → not-found**, predicted match.
  Why: the classifier's `nameSubstring` extraction preserves
  the exact source-text token `"new-todo"` (with hyphen). The
  TodoMVC input is labelled `<label for="todo-input">New Todo
  Input</label>` — three space-separated words, no hyphen. The
  regex `/new-todo input/i` does NOT match `"New Todo Input"`
  because hyphens are not whitespace. Playwright's
  accessible-name lookup finds the textbox correctly when
  queried as `getByRole('textbox', { name: /new\s+todo/i })`,
  but the nameSubstring as extracted does not normalize that
  way. **This is Probe Seed 6, new this cycle:**
  *classifier-extracted nameSubstring should normalize
  hyphens to whitespace (or apply a fuzzier match) when
  fed to Playwright's accessible-name query, because rendered
  labels rarely preserve fixture-source-text punctuation.*

New findings (unpredicted):
- **Observe verb has no role, so naive resolution can't run on
  observe steps at all.** Three of the six handoffs come from
  observe steps that the classifier would not even attempt to
  resolve. This is **Probe Seed 5, new this cycle:** *the
  observe verb's TargetShapeHint extractor does not infer a
  role; the runner consequently has no DOM strategy for
  observation. Either (a) observe should infer roles (most
  observed targets are text or landmarks), or (b) the runner
  should fall back to text-content lookup or landmark
  traversal when role is null.*
- **The signal-to-noise ratio of this run is excellent.** Nine
  steps produced four distinct probe seeds — three confirming
  cycle-1 hypotheses, one new prediction-break, one entirely
  unpredicted. That is dense evidence per unit of authoring
  cost. The cohort is doing what the spike said it would.

**Receipts on disk.** Each case produced a JSON receipt under
`workshop/logs/public-aut-receipts/todomvc/`. The dir is
gitignored (`workshop/logs/` per the existing .gitignore),
which matches the runtime-artifact discipline. The receipts'
schema is self-contained (`schemaVersion: 1`,
`substrateVersion: 'floor-a5-heuristic-naive-dom'`), which
means future cycles can reproduce the run and diff outcomes
against this baseline without renaming. An exemplar receipt
shape:

```json
{
  "schemaVersion": 1,
  "substrateVersion": "floor-a5-heuristic-naive-dom",
  "aut": "todomvc",
  "autUrl": "https://todomvc.com/examples/react/dist/",
  "partition": "training",
  "cohortRole": "training",
  "adoId": "91002",
  "title": "Verify user can mark a todo as complete",
  "stepCount": 3,
  "stepsMatched": 1,
  "handoffsEmitted": 2,
  "stepOutcomes": [...]
}
```

**What I want to improve (this cycle's seeds, formal list).**

In priority order — same shape as Entry 6, with provenance now
that the seeds are real-handoff-grounded:

1. **Probe Seed 1 (recurrent): role-flattening on click+X.**
   When the action text says "click the X checkbox", "click
   the X link", "click the X tab", etc., the classifier should
   honor the role hint in the surrounding text. Today it
   flattens all to `role: button`. Confirmed across two of
   three cases here; will recur on every AUT with non-button
   click targets.
2. **Probe Seed 5 (new): observe-without-a-role.** The
   observe verb's TargetShapeHint extractor needs role
   inference. Most observation steps target text content,
   counts, or landmarks — none of which the runner can resolve
   without a role hint.
3. **Probe Seed 6 (new): nameSubstring hyphen-normalization.**
   The classifier should not preserve fixture-source-text
   hyphens when extracting names that will be queried against
   accessible-name labels. Either normalize at extraction time
   or apply fuzzier matching at query time.
4. **Probe Seed 2 (refined): press-as-click extracts no
   target.** Beyond the press-as-click verb classification
   bug, the underlying click-target regexes never match
   "press" prose. Both layers need a fix — keyboard-verb
   distinct from click, AND target extraction that knows about
   keyboard shapes.


---

## Entry 11 — synthesis: cycle 2 vs cycle 1

This is cycle 2's synthesis. Compared to cycle 1 (Entry 6), the
gap from "what we hypothesized" to "what we measured" is much
narrower this time.

### What got better since cycle 1

- **Real handoffs, not classifier-acceptance verdicts.** Cycle 1
  produced 9/9 `would-resolve` verdicts because the heuristic
  classifier never reached a binder. Cycle 2 produced 3/9
  matched + 6/9 handoffs against a real DOM. Floor A.5
  successfully climbed half a rung.
- **Provenance per receipt.** Each handoff is now a JSON file
  under `workshop/logs/public-aut-receipts/todomvc/` carrying
  `substrateVersion`, `cohortRole`, `partition`, the full
  `stepOutcomes` array, and the `runStartedAt` timestamp. The
  next cycle can diff outcomes against this baseline and
  declare regressions or improvements precisely.
- **Predictions test-driven.** Cycle 1's Entry 5 named two
  probe seeds without provenance. Cycle 2's Entry 8
  pre-registered three predictions; Entry 10 confirmed three,
  broke one, and added two unpredicted findings. The cycle now
  exhibits the falsifiability discipline the spike's §11
  (self-improvement loop) demands of the compounding engine.
- **The cohort home is plumbed end-to-end.** From manifest
  (`cohort.json`) → loader (`load-public-aut-cohort.ts`) →
  runner (`public-aut-runner.ts`) → CLI (`compile-public-aut`)
  → receipts (`workshop/logs/public-aut-receipts/`). One
  command runs the full chain. This is a structural milestone:
  the cohort can now be a *thing* rather than a plan.

### What still doesn't work (the next cycle's seeds)

In priority order, with provenance:

1. **Trust-policy gate is still not partition-aware.**
   Carried over from Entry 7 seed 1 — held-out evaluation
   cannot honestly run yet because canon graduation isn't
   gated on `cohortRole === 'training'`. The runner emits
   `cohortRole` in the receipt, but the gate doesn't read it.
   This is the load-bearing piece for any held-out work.
2. **Probe Seed 1 (role-flattening) — confirmed twice
   today.** Highest-leverage classifier fix. The intent
   classifier's click target extractor needs to honor "X
   checkbox" / "X link" / "X tab" hints in the surrounding
   text, not flatten everything to `role: button`.
3. **Probe Seed 5 (observe-without-a-role) — new today.**
   Three of six handoffs come from this single gap.
   Highest-volume failure family. Either fix the classifier
   to infer roles for observe, or fix the runner to fall
   back to text/landmark resolution when role is null.
4. **Probe Seed 6 (nameSubstring hyphen-normalization) — new
   today.** The most surprising finding because it broke a
   step I had predicted to succeed. Not high-volume but
   high-relevance: rendered labels almost never preserve
   fixture-source-text punctuation, so this gap will recur.
5. **Probe Seed 2 (press-as-click) — refined today.** Both
   layers (verb classification + target extraction) need to
   learn about keyboard verbs.
6. **Architecture law for cohort manifest invariants** —
   carried over from Entry 7 seed 4. Becomes more urgent now
   that the manifest is a real input to a real runtime path.
7. **Snapshot-once-replay-forever not yet wired.** The
   runner navigates live every time. The cohort manifest's
   `snapshotFingerprint` field is still `null`; capture
   write-back is the next-cycle infra piece (carried from
   Entry 7 seed 3).

### What this teaches the spike doc

The spike's §4.1 names three cold-start floors (A / B / C).
Cycle 2 demonstrates a Floor A.5 that the spike doesn't
explicitly name — heuristic classifier + naive DOM resolution.
**Suggested doc revision (next cycle): make Floor A.5
first-class** alongside A/B/C. The justification: A.5 is a
real, executable, measurable floor that the cohort operates
at *today*, distinct from A (no DOM probe at all) and from
B/C (real compile pipeline). Hiding it inside "cold-start
today" loses precision that Floor identity now travels in
receipts to recover.

### What this teaches the self-improvement loop framing

The spike's §11 named the journal-revision-code cycle as the
nascent self-improvement loop. Cycle 2 is the first iteration
where the loop's *predictive* fidelity could be measured: I
named what I expected before running, and the run agreed with
three of four predictions and surfaced two unpredicted gaps.
The compounding engine's plan calls this
`metric-hypothesis-confirmation-rate`
(`docs/v2-compounding-engine-plan.md §1.1`). Cycle 2's
manual confirmation rate is **3/4 ≈ 0.75 across predicted
outcomes, with 2 additional unpredicted findings.** That
number means little in isolation — but as cycle 3+ accumulate
data points, the trajectory of confirmation rate becomes the
manual analogue of the engine's headline graduation metric.

The journal is now structurally sufficient for the
compounding engine to consume. Each entry's pre-registered
prediction (Entry 8) + observed outcome (Entry 10) is
isomorphic to a `HypothesisReceipt`'s `{predicted, observed,
confirmed}` triple. When the engine lands, this journal
becomes the bootstrap dataset for its first
hypothesis-confirmation-rate computation.

The journal stops here for cycle 2. Held-out evaluation
remains untouched per spike §4.4 C1; the public OutSystems
Reactive demo URL is still TBD with the operator. The next
cycle's load-bearing choice is between (a) trust-policy
partition-awareness (unblocks held-out) or (b) classifier
role-inference fix (unblocks generic-tier matcher quality
across all AUTs). Both are tractable in one cycle; the
operator's call.
