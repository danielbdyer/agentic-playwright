# Tesseract Cohort — One-Page Brief

> Status: 2026-05-03. Plain-English summary of where the
> public-AUT cohort spike stands after nine cycles of work.
> No internal jargon. Three things the system does, three
> things it doesn't yet, three things a stakeholder cares
> about.

## What the system does

The system takes a written test case in normal English —
the kind a manual QA tester writes in Azure DevOps — and
runs it in a real browser, with no developer authoring any
Playwright code in between. A test that says

> *Open the customer order form. Enter Alice in the Customer
> Name field. Click the Submit Order button.*

is read by the system, executed step-by-step against a real
public website, and reported as a sequence of outcomes:
which step found its target, which step did the right
thing, which step got stuck and why.

For tests that need setup state ("Navigate to TodoMVC with
at least one todo in the list"), the test author can declare
preconditions inline — small natural-language setup steps the
system runs before the assertions. For each step that
references a UI element, the test author can also declare
*which specific element they meant* (the role and accessible
name); the system verifies that the element it found is the
element the author intended, not just *some* element matching
the words.

## What we've measured it can do

Across two real public websites it was iteratively tuned for
— the React variant of TodoMVC and a customer-order form on
httpbin.org — the system handles **15 of 18** substantive
step-actions on its own. That's an 83% hit rate.

Of those 15 matches, **7** are verified to do exactly what
the test author intended. **1** silently clicked the wrong
target (the toggle-all-todos checkbox instead of a specific
todo's checkbox); the system now flags that as a labeled
false positive automatically — anyone reading the receipt
sees the bug at the metric level.

**Three end-to-end test cases run completely without human
intervention:** adding a todo (navigate → fill new-todo
input → press Enter), submitting a customer order
(navigate → fill name field → click Submit), and verifying
required form fields are present (navigate → observe two
named elements).

## What we've measured it can't do

On a held-out site the system was never tuned for — the
OutSystems corporate marketing homepage — it handled **0 of
3** substantive step-actions. This is the cohort's first
defensible generalization measurement, run by a separate
agent under strict clean-room rules.

All three failures share a single root cause: when a test
says "verify the **English language** link is visible," the
system extracts "English language" as the element name and
queries for a link named that. The actual link's accessible
name is just "English." The classifier is currently not
strict about distinguishing name-words from descriptive
context-words.

**Importantly, none of the held-out failures were silent.**
Zero false positives. When the system can't find what's
asked for, it says so honestly with a diagnosable message.
That property — diagnosable failure over hidden wrong-click —
is the most important quality of any test runner, and it
holds.

## What a customer would pay for, conditional on the above

A QA team with a backlog of manual ADO test cases written
in English could plug them into this system today and have
roughly **70–80% of their step-actions handled
automatically** against well-shaped websites with sensible
ARIA. The remaining steps surface as well-described
handoffs telling the team exactly which element couldn't be
found and why. There is no risk of the system silently
passing on the wrong action — false positives are caught
automatically when the test author declares the intended
target.

A customer trying the system on a marketing-style website
or one with hover-revealed UI would currently see most
tests fail, but **fail diagnosably**: the receipts name the
element the system tried, the element the test author meant,
and why they didn't match. The customer can decide whether
to wait for the gap to close, contribute fixture-side
disambiguation, or fall back to manual QA for those flows.

## Where the work goes from here

The single classifier weakness exposed by the held-out — the
context-word capture — is one localized fix. Closing it
should restore the system's match rate on at least the
held-out site's class of test phrasings. After that, a fresh
held-out site lets us measure generalization again.

Three things sit ahead in the system's roadmap:

1. **Close the context-word gap.** Single classifier change;
   targeted test cases pin the new behavior.
2. **Investigate hover-revealed UI.** A marketing site's
   language switcher may live in a region the runner can't
   probe by default. Either the runner learns to expand
   hover regions, or the cohort declares that AUT shape as
   out-of-scope.
3. **Cost and human-baseline metrics.** Per-test runtime is
   already captured; we need to surface it. A
   side-by-side comparison with hand-authored Playwright
   would tell us what we're saving against.

## What this brief is intentionally NOT

- Not a roadmap or an SLA. The numbers are based on 6
  hand-authored test cases across 3 sites, not a customer's
  real backlog.
- Not a generalization claim. Cycle 9's held-out hit rate
  was 0% on substantive steps; we don't currently claim the
  system generalizes to arbitrary new sites.
- Not a recommendation to ship. The next sensible engagement
  shape is a focused trial against a customer's specific
  site, with the customer's actual test cases, and the
  expectation that 1–3 fixes will be needed.

## Where the detail lives

For the agent or engineer who needs more:

- **Per-cycle detail:** `docs/v2-cold-start-todomvc-journal.md`
  (37 entries; cycles 1–9). Plain English from cycle 8
  onward; earlier entries use internal jargon that's been
  retired.
- **Spike doctrine:** `docs/v2-cold-start-cohort-spike.md`
  (the clean-room rule and the partition discipline).
- **Cohort manifest:** `workshop/customer-backlog/public-aut/cohort.json`
  (which sites are training, which are held-out, and the
  cycle-9 evaluation result).
- **The toggle-all bug receipt** (cycle 8's labeled false
  positive) lives at
  `workshop/logs/public-aut-receipts/todomvc/91002-*.json`.
  It's the cleanest single-receipt demonstration of the
  semantic-correctness check working as intended.
