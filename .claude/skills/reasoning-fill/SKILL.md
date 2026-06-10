---
name: reasoning-fill
description: Drain the .tesseract/reasoning-pool/pending/ directory by authoring responses to each pending reasoning request, writing FilledResponse envelopes to filled/, then validating them. Use when pending reasoning-pool files exist (a compile run halted on needs-fill), when the user runs /reasoning-fill, or when an autotelic trigger reports a non-empty pool.
---

# Reasoning-pool fill pass (Z11d)

The product's `--reasoning-mode record|live` compile runs park
prompts they cannot answer under `.tesseract/reasoning-pool/pending/`.
This skill authors the responses ("fills") so the next run replays
them as real reasoning receipts. Spec: `docs/v2-live-adapter-plan.md §6`.

## Protocol

1. **Survey the pool:**
   ```bash
   npx tsx scripts/reasoning-fill.ts list
   ```
   If `pendingCount` is 0, say "Nothing to fill" and stop.

2. **Dispatch a subagent to author fills** (keeps main context
   clean — plan §6.3). Give it the `list` output and these norms:
   - For each request, write `<fillTarget>/<promptFingerprint>.json`
     **atomically** (write `.tmp-` file, then rename) as a
     `FilledResponse` envelope:
     ```json
     {
       "promptFingerprint": "<from the request>",
       "filledAt": "<ISO-8601 now>",
       "authorSessionId": "<session id or empty string>",
       "response": { "text": "<the authored response>" },
       "reasoningSummary": "<ONE line of rationale>",
       "estimatedTokens": { "prompt": <ceil(promptText.length/4)>, "response": <ceil(text.length/4)>, "source": "estimated" },
       "supersedes": null
     }
     ```
   - **Respect `expectedResponseShape`**: `json-schema` → the text
     must contain a valid JSON object per the request's `schema`
     string; `enum-token` → the text is exactly one of `enumValues`;
     `plain-text` → free-form prose.
   - **Engage with the prompt; don't pattern-match.** Read the
     candidate screens/elements in the prompt and reason about which
     one the step text means. A careless fill poisons the replay
     cache and the compounding engine's refutation signal will name
     this skill as the cause.
   - **Don't fabricate.** If the prompt asks for information you
     don't have, respond `{ "matched": false, ... }` /
     `{ "interpreted": false, ... }` with the rationale "insufficient
     information; resolve manually" — a needs-human handoff
     downstream is the correct outcome, not a guess.
   - Skip requests whose `filledAlready` is `true`.

3. **Validate what was authored:**
   ```bash
   npx tsx scripts/reasoning-fill.ts validate
   ```
   Admitted fills consume their pending file; mismatched fills move
   to `rejected/` (their pending file stays visible for a re-fill).

4. **Report**, under 100 words: count drained, count rejected (with
   one-line reasons), count still unfilled.

## Opt-out

`TESSERACT_REASONING_AUTOFILL=off` disables autotelic triggers;
manual invocation of this skill always works.
