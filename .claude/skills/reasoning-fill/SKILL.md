---
name: reasoning-fill
description: Autonomously fill the cohort reasoning pool (Z11d). Use when the public-AUT cohort was run with `--reasoning-mode record` and parked pending semantic-bridge requests in `.tesseract/reasoning-pool/pending/`, and you want a fresh, context-isolated reasoner to author the answers so a `--reasoning-mode replay` run can resolve them.
---

# Reasoning fill (Z11d)

The "fill" leg of the record/fill/replay triad. The cohort's
reasoning rung parks pending candidate-selection requests (a phrase
+ a ranked accessible-name menu) when token-overlap resolution
fails — the semantic bridges like "tickbox example" → "Checkboxes"
or "Japanese language" → 日本語. This skill authors the answers
**autonomously**, via a context-isolated subagent, so the answer is
NOT the orchestrating session's inline judgment.

## Why an isolated reasoner (clean-room + autonomy + agnosticism)

The reasoning answer must come from a reasoner that is **blind to**
the authored expectedTarget and the building context — otherwise a
held-out evaluation is self-graded (spike §4.4 C5). Any of the
paths below gives a separate reasoning context fed only the neutral
pooled prompt. For a **held-out**, a *different vendor* (Path A
with Copilot or another model) is the strongest fresh-evaluator —
different model, different context, no shared session state — and
is more defensible than a same-family subagent (which is itself
weaker than a human-relayed separate session; state that caveat
when reporting a held-out result). The system never trusts the
reasoner's substrate: the replay guards verify every answer, so
substrate choice is about isolation + cost, not correctness-trust.

## The fill is substrate-agnostic

The pool is a filesystem queue; the prompt is self-contained.
*Any* reasoner that maps a prompt to a one-line answer can fill it.
Pick whichever substrate you have — they are interchangeable, and
the replay guards keep a weaker/different one from corrupting a
result. Three equivalent paths:

### Path A — agnostic CLI dispatch (`fill-via`)

The universal substrate: pipe each pending prompt to an external
reasoner on stdin, capture its answer on stdout. Works with the
GitHub Copilot CLI, an `llm`-style wrapper, a bespoke API client,
or any 2-line script:

```bash
npx tsx scripts/reasoning-fill.ts fill-via -- copilot -p
npx tsx scripts/reasoning-fill.ts fill-via --model gpt-4o -- llm -m gpt-4o
npx tsx scripts/reasoning-fill.ts fill-via -- ./my-reasoner.sh
```

The command MUST read the prompt on stdin and print the answer
(exact menu item, or NONE) on stdout. Vendor flags differ by CLI
version; wrap in a short script if a CLI needs the prompt as an
argument instead of stdin. The fill records the reasoner's model +
token cost for provenance/metering.

### Path B — Claude Code subagent (context-isolated, in-harness)

1. `npx tsx scripts/reasoning-fill.ts list` to read the pending
   prompts.
2. For each, dispatch ONE `Agent` (`general-purpose`) whose prompt
   is *exactly* the request's `prompt`, prefixed with "Do not use
   any tools. Respond with exactly one line: the exact menu item
   text, or NONE." Do NOT add the expected answer or hints — that
   contaminates the fill.
3. `npx tsx scripts/reasoning-fill.ts fill <fingerprint> "<answer>"`.

### Path C — manual

`npx tsx scripts/reasoning-fill.ts fill <fingerprint> "<answer>"`
with a human-authored answer.

## Then replay

Re-run the cohort with `--reasoning-mode replay`. The reasoning
rung confirms each filled answer against the live page (exact
unique match) AND the cycle-8 check verifies it is the *right*
element. A wrong or hallucinated answer cannot silently pass — the
guards reject not-in-menu and non-unique answers, regardless of
which substrate produced it.

## Boundaries

- One fill per pending fingerprint; identical asks share a
  fingerprint (deterministic cache), so re-running is idempotent.
- The fully autotelic cadence (a `/loop` timer + PostToolUse/Stop
  hooks that drain the pool without prompting) is the deferred
  operational layer (live-adapter plan §7); this skill is the
  load-bearing manual cadence it would automate.
