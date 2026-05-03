# Held-Out Evaluation Handoff — Cycle 9

> **Status: ready for evaluation by a fresh agent (2026-05-02).**
> Self-contained — a fresh agent should be able to execute this
> document end-to-end without reading any other repo doc.

## Why this document exists

The cohort spike at `docs/v2-cold-start-cohort-spike.md` defines
a clean-room rule: the agent that improved the system on the
training sites must NOT be the agent that runs the evaluation
on the held-out site. Otherwise, what looks like a generalization
measurement is partly a self-graded test.

This document is the handoff. The original agent (Claude, in the
session where cycles 1–8 ran) authored the held-out fixtures and
cohort entry, then stopped. A **fresh agent** runs the
evaluation, captures the output, and reports back. The original
agent then incorporates the result into the journal as cycle 9's
synthesis.

## What you (the fresh evaluator) must do — and must NOT do

**You must:**
- Run the cohort runner against the held-out AUT exactly once.
- Capture the structured output (JSON) verbatim.
- Report the captured output back to the operator (the human
  user) with no interpretation, no fixes, no commentary about
  what could be improved.

**You must NOT:**
- Read or modify any code in
  `product/domain/resolution/patterns/intent-classifier.ts` or
  `workshop/customer-backlog/application/public-aut-runner.ts`
  to "fix" anything that fails. Failures are evidence; do not
  patch them.
- Read or modify any other code in the repo.
- Run anything against the held-out AUT (https://www.outsystems.com/)
  beyond what this document instructs. Don't browse it. Don't
  inspect it manually. The evaluation run is the only contact.
- Author or modify any fixtures in
  `workshop/customer-backlog/public-aut/outsystems-com/`.
  These were authored by the previous agent before this handoff.
- Read or modify any cycle-9-related journal entries (entries
  32–35 already exist and are background only). The cycle-9
  synthesis entry will be authored by the original agent after
  you report back.

If something is unclear or fails for a reason you can't act on
(e.g., browser launch error, network failure), report the
error verbatim to the operator and stop. Do not attempt to
diagnose or fix.

## The held-out AUT, in plain English

- **URL:** `https://www.outsystems.com/`
- **What it is:** OutSystems' corporate marketing homepage.
- **Honest finding from operator inspection:** the original
  agent inspected the page once (allowed under the spike's
  §4.4 C5 — operator inspection during fixture authoring).
  Inspection found that this site is NOT built on OutSystems
  Reactive itself: no `osui-*` CSS classes, no `__OSVSTATE`
  hidden input. The variant classifier in
  `workshop/substrate-study/` would correctly classify it as
  "not OutSystems Reactive."
- **Why it's the held-out anyway:** it's still a real-world
  foreign DOM with multi-section content and real
  marketing-page chrome. The 3 fixtures authored against it
  target the language-switcher links, which are the most
  stable elements (don't drift with marketing campaigns).

## The 3 fixtures

Already committed at
`workshop/customer-backlog/public-aut/outsystems-com/`:

1. **`91201-outsystems-english-link.ado.json`** — Verify the
   English language link is visible. Single observe step.
   `expectedTarget`: `{ role: 'link', name: 'English' }`.
2. **`91202-outsystems-japanese-link.ado.json`** — Verify the
   Japanese language link is visible. Single observe step.
   `expectedTarget`: `{ role: 'link', name: '日本語' }`. Tests
   the runner's behavior on a non-Latin accessible-name.
3. **`91203-outsystems-german-click.ado.json`** — Click the
   Deutsch language link. Click step.
   `expectedTarget`: `{ role: 'link', name: 'Deutsch' }`.

Cohort manifest entry at
`workshop/customer-backlog/public-aut/cohort.json` declares
this AUT with `partition: 'held-out'`.

## The evaluation command

Set the Playwright browser executable path, then run the cohort
runner with `--aut outsystems-com` and `--cohort-role held-out`:

```bash
TESSERACT_PLAYWRIGHT_EXECUTABLE=/opt/pw-browsers/chromium-1193/chrome-linux/chrome \
  node dist/bin/tesseract.js compile-public-aut \
  --aut outsystems-com \
  --cohort-role held-out
```

If the `dist/` directory is stale, run `npm run build` first.
The build is idempotent and does not modify any code paths
relevant to the evaluation.

## What to capture and report back

The command emits a single JSON object on stdout. Capture it
verbatim. Do not trim, do not reformat, do not summarize.
Particularly important fields:

- Top-level `result.stepsTotal`, `stepsMatched`,
  `handoffsEmitted`, `verifiedMatches`, `falsePositives`,
  `unverifiedSteps`.
- Each `result.perCase[i]` contains the per-case breakdown
  with `stepOutcomes` array.
- Each `stepOutcomes[i]` has `domResolution`, `verb`,
  `inferredRole`, `inferredNameSubstring`,
  `targetCorrectness`, `targetCorrectnessDetail`,
  `actionAttempted`, `actionOutcome`.

The full structured payload tells the original agent everything
it needs. **Do not synthesize a summary; just relay the
structured output.**

If the receipt files were also written (under
`workshop/logs/public-aut-receipts/outsystems-com/`), note
their existence but the gitignored directory means they don't
need to be committed.

## What the original agent will do with your report

The original agent will:

1. Compute the held-out hit rate: `stepsMatched / stepsTotal`.
2. Compare against the training hit rate (currently 12/12
   excluding observe-text-mismatch handoffs from cycle 8).
3. Compute the verified-correct rate among matched steps:
   `verifiedMatches / (verifiedMatches + falsePositives)`.
4. Author journal Entry 36 with the held-out outcome AND the
   first defensible generalization-gap measurement since
   cycle 5–7's contaminated numbers.
5. Update the cohort manifest's `evaluationStatus` from
   `pending` to `evaluated`.

## What success looks like for THIS handoff (not the run)

The handoff is successful if:

- You ran the command exactly once.
- You captured the JSON output verbatim.
- You did not read or modify any code or fixtures.
- You did not contact the held-out URL outside the run.
- You report the JSON back without interpretation.

The held-out **measurement** (whatever it turns out to be) is
the original agent's problem to interpret. Your job is to
produce a clean, untainted measurement.

## After this handoff lands

The original agent stops here. The next conversational turn
is yours, evaluator. When you reply, paste the JSON output,
note any errors that occurred, and stop. Do not begin a new
cycle.

---

**One sanity check before you run:** verify the manifest entry
exists by reading `workshop/customer-backlog/public-aut/cohort.json`
— it should list three AUTs, with `outsystems-com` having
`partition: 'held-out'`. If it doesn't, do not improvise; tell
the operator the manifest is missing the entry and stop.
