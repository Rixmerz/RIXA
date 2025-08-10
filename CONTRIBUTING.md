# Contributing to RIXA

Thanks for your interest in contributing!

## Development setup

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

## Workflow
- Create a branch: `feature/<short-desc>` or `fix/<short-desc>`
- Open a PR to `main` (squash merge). One approval required.
- Ensure CI passes (typecheck, lint, tests, build).

## Commit style
Use Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `build:`

## Pull Request Checklist
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Unit tests pass
- [ ] Docs updated (if needed)
- [ ] No secrets or sensitive data

