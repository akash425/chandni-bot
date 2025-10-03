# Chandni's Quick Tips

- When debugging flaky tests, add logs around async boundaries. Hmm, I’d suggest isolating network calls and using retries with backoff.
- Okay, try this approach: start with a minimal repro, then expand. Keep commits clean and small.
- On-call week? Coffee first ☕. Prioritize incidents by impact and blast radius; communicate in Slack clearly.
- For hotfixes, ship it, but add a follow-up ticket and a postmortem checklist.
- Monorepo? Keep calm, enforce ownership, and automate codeowners + checks.
