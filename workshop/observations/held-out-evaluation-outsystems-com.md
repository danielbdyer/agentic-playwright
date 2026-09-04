# Held-Out Evaluation — outsystems-com (cycle 9)

**Date:** 2026-09-04
**Evaluator:** a fresh agent session (per `docs/v2-cold-start-cohort-handoff-cycle-9.md`), not the agent that ran cycles 1–8.
**Canon state at evaluation:** commit `a56134b` (main, 2026-05-02 handoff), classifier and runner untouched.
**Verbatim CLI output:** `workshop/observations/fixtures/held-out-outsystems-com-2026-09-04.evaluation.json`

This memo records the measurement and the conditions it was taken under. It does not
author the cycle-9 synthesis (journal Entry 36); the handoff reserves that for the
operator or the original agent.

## Protocol compliance

- The evaluation command ran exactly once against `https://www.outsystems.com/`
  (2026-09-04T04:15:20Z through 04:15:32Z). Two earlier invocations of the same
  command failed inside `page.goto` with `net::ERR_CONNECTION_RESET` before any
  byte of the page loaded (sandbox egress proxy; see below). They produced no
  receipts and are not measurements.
- `product/domain/resolution/patterns/intent-classifier.ts` and
  `workshop/customer-backlog/application/public-aut-runner.ts` were read but not
  modified. Nothing under `workshop/customer-backlog/public-aut/outsystems-com/` was
  modified.
- The held-out URL was not opened, fetched, or inspected outside the single run.
- The two training AUTs were re-run once each immediately before the held-out run
  to prove the browser environment (receipts under `workshop/logs/public-aut-receipts/`,
  gitignored).

## Environment accommodation (disclosed, not hidden)

The sandbox routes HTTPS through a TLS-intercepting egress proxy that never completed
a TLS 1.3 handshake with Chromium 140. Chromium was launched through a wrapper script
(outside the repo) that adds `--ssl-version-max=tls1.2`, declares the proxy
explicitly, and bypasses Google background hosts. No repo code changed. A site could
in principle serve different content to a TLS 1.2 client; the receipt cannot rule
that out.

## The numbers, as the runner reports them

| Field | Value |
|---|---|
| `stepsTotal` | 6 |
| `stepsMatched` | 3 (all three are `skipped-navigate`, counted as matched by the runner) |
| `handoffsEmitted` | 3 |
| `verifiedMatches` | 0 |
| `falsePositives` | 0 |
| `unverifiedSteps` | 0 |

Every DOM-targeting step (91201.2, 91202.2, 91203.2) resolved `not-found`. The
classifier inferred `role: link` correctly in all three but extracted the name
substring with the trailing word "language" attached (`/English language/i`,
`/Japanese language/i`, `/Deutsch language/i`); the authored `expectedTarget` names
are `English`, `日本語`, `Deutsch`. The runner's first-word fallback also returned
zero matches, which the receipt cannot explain: it records no page title, final URL,
or DOM snapshot, so "the link is not named that", "the site drifted since May", and
"the page served to a headless client had no such links" are indistinguishable from
the receipt alone.

## Training-side re-run on the same day (for the operator's comparison)

| AUT | steps | matched | verified-correct | false positives | handoffs |
|---|---|---|---|---|---|
| todomvc | 9 | 7 | 2 | 1 (91002.2, toggle-all checkbox) | 2 |
| httpbin-form | 9 | 8 | 5 | 0 | 1 |

These reproduce the cycle-8 receipts exactly (15/18 matched, 7 verified, 1 false
positive).

## Arithmetic the handoff says the original agent would compute

- Held-out hit rate (runner's definition): 3/6 = 0.50.
- Held-out hit rate on DOM-targeting steps only: 0/3 = 0.00.
- Training hit rate on DOM-targeting steps only: 9/12 = 0.75.
- Verified-correct rate among verifiable training matches: 7/8 = 0.875.
- Generalization gap on the DOM-targeting denominator: 0.75 − 0.00 = 0.75.

Whether the held-out failure is a classifier gap (name-substring over-capture), a
site-drift event, or a serving difference is the synthesis question this memo leaves
open. The receipt schema would need `pageTitle`, `finalUrl`, and a capped
accessibility-tree excerpt to make the next evaluation self-explaining; that is an
observation, not a change made here.
