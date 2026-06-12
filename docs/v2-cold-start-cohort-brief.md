# Tesseract Cold-Start Cohort — Product-Owner Brief

> Status: living one-pager (updated 2026-06-12, after cycle 10).
> Plain-English summary of what the system does against real
> public websites, what is proven, and what is not yet proven.
> Three paragraphs; no internal jargon.

**What it does.** The system takes a manually written test case
in ordinary English — "Click the Deutsch language link", "Enter
the standard username into the Username field" — and executes it
in a real browser against a real website, with no Playwright code
written by anyone. For each step it works out the action (click,
type, press, check), works out what kind of element is being
named, and then descends a ladder of strategies to find it: an
exact search first, then progressively looser phrasings, then a
full inventory of every matching element on the page — including
ones hidden inside collapsed menus — scored against the test's
wording. It only acts when exactly one safe, visible match wins
decisively, and every step is double-checked against the test
author's declared intent, so a step that "passes" on the wrong
element is flagged as a false positive instead of slipping
through silently.

**What is proven.** On three public sites of very different
shapes (a todo-list app, a corporate marketing homepage with a
collapsed language menu, and previously an order form), the
system currently handles 12 of 15 test steps end-to-end, with 4
of those independently verified as acting on exactly the element
the test author meant, and 1 known false positive that the
verification machinery itself caught and labeled. When a step
fails, it no longer fails empty-handed: the run report says what
WAS on the page — how many elements of the right kind exist, which
are visible, the closest candidates by name, and a one-line
diagnosis such as "the element exists but is hidden behind a
collapsed menu" or "nothing on the page shares a word with the
test's phrasing — this needs semantic interpretation." One real
failure was diagnosed and fixed this cycle purely by reading that
report, without anyone re-opening the site to investigate.

**What is not yet proven.** Generalization: the numbers above are
measured on sites the system was tuned against. A fresh, untouched
holdout site (a login form, deliberately a different shape from
everything in training) is designated and waiting; an independent
evaluation against it is the next checkpoint, and the previous
such checkpoint (before this cycle's improvements) scored zero —
that is the honest baseline being challenged. Also not yet built:
the reasoning layer for steps whose wording shares no vocabulary
with the page (e.g., a link labeled 日本語 when the test says
"Japanese"); today those steps stop safely and hand the next
actor everything needed to decide, which is the designed behavior
until that layer lands. Cost per run is now reported (seconds per
test case, no LLM tokens — the current system is fully
deterministic), and there is still no baseline comparison against
a human writing the same tests by hand.
