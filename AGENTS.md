# AGENTS.md

## General Guidelines

- Always prefer asking the user for input and clarification over making assumptions.
- ALWAYS use the question-tool (functions.ask_user) when asking the user questions, and always provide your recommended answer.
- Always select the appropriate skill for a specific task. Be sure to ALWAYS explicitly write in the chat when a skill is currently being used.
- Use descriptive variable and function names, write modular code, and use comments only when necessary, such as when explaining complex logic or decisions.
- Keep git history linear: integrate branches with `git rebase` and fast-forward (`git merge --ff-only`).

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `grehnen/akle` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
