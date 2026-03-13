# Operator Inbox

- Item count: 5

## Hotspot suggestions

- resolution-graph-needs-human :: 10001 :: winner-rung/needs-human (2)
  - knowledge/screens/10001.hints.yaml: Capture deterministic aliases/defaults so this family resolves without runtime fallback.
- recovery-policy-win :: policy-search :: policyNumberInput/input (1)
  - knowledge/screens/policy-search.hints.yaml: Capture deterministic aliases/defaults so this family resolves without runtime fallback.

## Needs human on step 2

- Inbox id: inbox-77e9370d98f510de572ca01ff90b47ef60d61555314fd93446868c7f69dea314
- Kind: needs-human
- Status: actionable
- Summary: Runtime exhausted approved knowledge and live DOM resolution for step 2.
- Scenario: 10001
- Run: 2026-03-12T19-21-54-959Z
- Step: 2
- Proposal id: n/a
- Target: n/a
- Winning concern: resolution
- Winning source: none
- Resolution mode: agentic
- Next commands: tesseract inbox | tesseract workflow --ado-id 10001

## Approved-equivalent overlay on step 3

- Inbox id: inbox-a1f01fc15d419d190427a97adc34ab0d1b8e29db74ea68476eabeb0fa8529eca
- Kind: approved-equivalent
- Status: informational
- Summary: Step 3 executed green using derived confidence overlays instead of approved canon.
- Scenario: 10001
- Run: 2026-03-12T19-21-54-959Z
- Step: 3
- Proposal id: n/a
- Target: overlay-1af46e0c464d915fe340682a9b720a6a2c897f29fecdd12a8d3831be18d81cc9
- Winning concern: knowledge
- Winning source: approved-equivalent
- Resolution mode: deterministic
- Next commands: tesseract inbox | tesseract workflow --ado-id 10001

## Resolution graph hotspot for run 2026-03-12T19-21-54-959Z

- Inbox id: inbox-bb2e3ed516c5d77df62ead18318a1365cc03d53498f7bc146ed6bfb610b3c802
- Kind: needs-human
- Status: actionable
- Summary: Resolution graph winners include live-dom=0, needs-human=2.
- Scenario: 10001
- Run: 2026-03-12T19-21-54-959Z
- Step: n/a
- Proposal id: n/a
- Target: n/a
- Winning concern: resolution
- Winning source: none
- Resolution mode: agentic
- Next commands: tesseract inbox | tesseract replay-interpretation --ado-id 10001

## Needs human on step 4

- Inbox id: inbox-bd6fec9f0c410a682c36aa58acf5cc9e41e11ad0d35386685da0c96dee4b7e06
- Kind: needs-human
- Status: actionable
- Summary: Runtime exhausted approved knowledge and live DOM resolution for step 4.
- Scenario: 10001
- Run: 2026-03-12T19-21-54-959Z
- Step: 4
- Proposal id: n/a
- Target: n/a
- Winning concern: resolution
- Winning source: none
- Resolution mode: agentic
- Next commands: tesseract inbox | tesseract workflow --ado-id 10001

## Approved-equivalent overlay on step 1

- Inbox id: inbox-dc9205929e50b774753c33b6f8a13c44be1d47fa39799e12aef2fcfd7b0442e5
- Kind: approved-equivalent
- Status: informational
- Summary: Step 1 executed green using derived confidence overlays instead of approved canon.
- Scenario: 10001
- Run: 2026-03-12T19-21-54-959Z
- Step: 1
- Proposal id: n/a
- Target: overlay-1af46e0c464d915fe340682a9b720a6a2c897f29fecdd12a8d3831be18d81cc9
- Winning concern: knowledge
- Winning source: approved-equivalent
- Resolution mode: deterministic
- Next commands: tesseract inbox | tesseract workflow --ado-id 10001
