---
description: Check that the page objects' facets still resolve on the live app
argument-hint: [screen] [profile]
---

Run `memory.preflight` with the tesseract-qa tools (screen "$1" and profile "$2" if given, otherwise every screen with a route). Summarize which facets are ok, stale, or missing, show the page fingerprint differences, and propose `memory.enrich` repairs for anything stale. Do not change any test files.
