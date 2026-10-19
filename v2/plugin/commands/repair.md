---
description: Repair a failing Playwright spec in place by attaching to the paused browser
argument-hint: <spec-path>
---

Repair $1 in place with the tesseract-qa tools: run it with `pauseOnFailure`, attach to the paused browser over CDP, observe the failing step's scope, try the repair, enrich the facet with the verified locator and the snapshot as evidence, and run it again. Report the facet, the old and new locator, and the result.
