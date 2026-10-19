---
description: Author an Azure DevOps test case as a plain Playwright test with the tesseract-qa tools
argument-hint: <ado-test-case-id> [profile]
---

Author Azure DevOps test case $1 as a plain Playwright test. Use profile "$2" if one was given, otherwise the default profile.

Follow the tesseract-qa playbook (read the `tesseract://playbook` resource if you have not this session): fetch the case, preflight the screens memory already knows, open the app, and for each step query memory, observe with the step wording as intent, act, assert the expected result on content, and mint what you used with the test author's words. Raise a handoff instead of guessing. Emit, run, and tell me the spec path so I can review it.
