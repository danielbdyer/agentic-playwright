---
description: Record a flow (login, precondition, happy path) walked once by a QA in a headed browser
argument-hint: <flow-name> <url-or-path> [profile]
---

Record the flow "$1" with the tesseract-qa tools: open $2 headed (profile "$3" if given), start `flow.record` with stopOn "manual", and tell me to walk the path and press the Stop button in the page. Then report the facets minted and the parameters, and replay it once with `flow.run` to confirm it works.
