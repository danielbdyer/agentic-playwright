# Held-Out Evaluation Handoff — Cycle 11

> **Status: ready for evaluation by a fresh agent (2026-06-12).**
> Self-contained — a fresh agent should be able to execute this
> document end-to-end without reading any other repo doc.
> Successor to `docs/v2-cold-start-cohort-handoff-cycle-9.md`,
> whose evaluation completed on 2026-06-12 (journal Entry 36).

## Why this document exists

The cohort spike at `docs/v2-cold-start-cohort-spike.md` defines
a clean-room rule: the agent that improved the system on the
training sites must NOT be the agent that runs the evaluation
on the held-out site. Otherwise, what looks like a generalization
measurement is partly a self-graded test.

Cycle 10 built the degraded-resolution ladder (journal Entry 37)
using the training sites — including outsystems-com, which was
promoted out of held-out for exactly that purpose. This document
hands off the NEXT clean measurement: does the ladder generalize
to a surface nobody tuned it against?

The agent that authored cycle 10 (and these fixtures) stops
here. A **fresh agent** runs the evaluation, captures the
output, and reports back. The synthesis entry (journal Entry 38)
is authored only after that report.

## What you (the fresh evaluator) must do — and must NOT do

**You must:**
- Run the cohort runner against the held-out AUT exactly once.
- Capture the structured output (JSON) verbatim.
- Report the captured output back to the operator (the human
  user) with no interpretation, no fixes, no commentary about
  what could be improved.

**You must NOT:**
- Read or modify any code in
  `product/domain/resolution/patterns/` or
  `workshop/customer-backlog/application/` to "fix" anything
  that fails. Failures are evidence; do not patch them.
- Read or modify any other code in the repo.
- Run anything against the held-out AUT
  (https://www.saucedemo.com/) beyond what this document
  instructs. Don't browse it. Don't inspect it manually. The
  evaluation run is the only contact.
- Author or modify any fixtures in
  `workshop/customer-backlog/public-aut/saucedemo/`. These
  were authored by the previous agent before this handoff.

If something is unclear or fails for a reason you can't act on
(e.g., browser launch error, network failure), report the
error verbatim to the operator and stop. Do not attempt to
diagnose or fix.

## The held-out AUT, in plain English

- **URL:** `https://www.saucedemo.com/`
- **What it is:** Swag Labs — Sauce Labs' public QA-demo
  storefront. The held-out fixtures target only the login
  page: two labeled text fields (Username, Password) and a
  Login button.
- **Why it was chosen:** shape-differentiated from every
  training AUT. Training covers a todo list (TodoMVC), a
  server-rendered order form (httpbin — unreachable from the
  current egress), and a marketing page with a collapsed
  language menu (outsystems.com). A credential form is none
  of those. It is also a deliberately stable page — it exists
  so QA tools can be demoed against it.
- **Authoring contact:** the authoring agent made exactly one
  inspection pass (an aria snapshot of the login page) to
  write `expectedTarget` values, and never ran the cohort
  runner against it.

## The 3 fixtures

Already committed at
`workshop/customer-backlog/public-aut/saucedemo/`:

1. **`91301-saucedemo-username-field.ado.json`** — Verify the
   Username field is visible. Single observe step.
   `expectedTarget`: `{ role: 'textbox', name: 'Username' }`.
2. **`91302-saucedemo-enter-username.ado.json`** — Enter the
   standard username into the Username field. Input step with
   a dataRow value (`standard_user`).
   `expectedTarget`: `{ role: 'textbox', name: 'Username' }`.
3. **`91303-saucedemo-login-click.ado.json`** — Click the
   Login button. Click step.
   `expectedTarget`: `{ role: 'button', name: 'Login' }`.

Cohort manifest entry at
`workshop/customer-backlog/public-aut/cohort.json` declares
this AUT with `partition: 'held-out'`.

## The evaluation command

Set the Playwright browser executable path (adjust if your
environment installed Chromium elsewhere), then run the cohort
runner with `--aut saucedemo` and `--cohort-role held-out`:

```bash
TESSERACT_PLAYWRIGHT_EXECUTABLE=/opt/pw-browsers/chromium-1193/chrome-linux/chrome \
  node dist/bin/tesseract.js compile-public-aut \
  --aut saucedemo \
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
  `unverifiedSteps`, `matchesByRung`, `totalElapsedMs`.
- Each `result.perCase[i].stepOutcomes[i]` — especially
  `domResolution`, `resolutionRung`, `targetCorrectness`,
  and (on any handoff) the `evidence` object: its
  `candidates`, `attempts`, and `note` fields are the
  cycle-10 additions whose held-out behavior this evaluation
  measures.

**Do not synthesize a summary; just relay the structured
output.**

If the receipt files were also written (under
`workshop/logs/public-aut-receipts/saucedemo/`), note their
existence but the gitignored directory means they don't need
to be committed.

## What the synthesizing agent will do with your report

1. Compute the held-out hit rate on DOM-targeting steps and
   the verified-correct rate among matched steps.
2. Compare against cycle 9's held-out baseline (0/3 before the
   ladder existed) and cycle 10's training numbers (12/15
   matched, 4 verified, 1 known false positive).
3. Examine any handoffs' evidence payloads: a handoff that
   carries a usable candidate menu is a partial success of the
   cycle-10 design even when the step does not match.
4. Author journal Entry 38 with the result.
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
the synthesizing agent's problem to interpret. Your job is to
produce a clean, untainted measurement.

---

**One sanity check before you run:** verify the manifest entry
exists by reading `workshop/customer-backlog/public-aut/cohort.json`
— it should list four AUTs, with `saucedemo` having
`partition: 'held-out'` and `evaluationStatus: 'pending'`. If
it doesn't, do not improvise; tell the operator the manifest
is missing the entry and stop.
