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

## Why a subagent (clean-room + autonomy)

The reasoning answer must come from a reasoner that is **blind to**
the authored expectedTarget and the building context — otherwise a
held-out evaluation is self-graded (spike §4.4 C5). Dispatching a
fresh subagent whose entire prompt is the neutral pooled question
gives both properties: it is a separate reasoning context
(autonomous) and it has not seen the ground truth (fresh
evaluator). It is the in-session approximation of a fresh agent —
weaker than a human-relayed separate session, so state that caveat
when reporting a held-out result.

## Protocol

1. **List the unfilled requests**:

   ```bash
   npx tsx scripts/reasoning-fill.ts list
   ```

   Each entry has a `fingerprint` and a `prompt` (a neutral
   candidate-selection question + menu).

2. **For each pending request, dispatch ONE context-isolated
   subagent** (the `Agent` tool, `general-purpose`) whose prompt is
   *exactly* the request's `prompt` field, prefixed with: "Do not
   use any tools. Respond with exactly one line: the exact menu item
   text, or NONE." Do NOT add the expected answer, hints, or the
   fact that this is a graded test — that would contaminate the
   fill.

3. **Write the fill** with the subagent's one-line answer and its
   reported token usage (real metering):

   ```bash
   npx tsx scripts/reasoning-fill.ts fill <fingerprint> "<answer>"
   ```

   (`fill` records `filledBy` as the session; capture the
   subagent's `subagent_tokens` into the receipt when extending the
   script for metered cost.)

4. **Replay**: re-run the cohort with `--reasoning-mode replay`. The
   reasoning rung confirms each filled answer against the live page
   (exact unique match) AND the cycle-8 check verifies it is the
   *right* element. A wrong or hallucinated answer cannot silently
   pass — the guards reject not-in-menu and non-unique answers.

## Boundaries

- One fill per pending fingerprint; identical asks share a
  fingerprint (deterministic cache), so re-running is idempotent.
- The fully autotelic cadence (a `/loop` timer + PostToolUse/Stop
  hooks that drain the pool without prompting) is the deferred
  operational layer (live-adapter plan §7); this skill is the
  load-bearing manual cadence it would automate.
