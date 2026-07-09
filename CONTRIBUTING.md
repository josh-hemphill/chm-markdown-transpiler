# Contributing

Thanks for helping improve chm-markdown-transpiler.

## Development setup

- Node.js **≥ 24**
- pnpm **10**

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Workflow

1. Fork and branch from `main`.
2. Make focused changes with tests for new behavior.
3. Run `pnpm typecheck` and `pnpm test` before opening a PR.
4. Add a Changeset when the change should trigger an npm release (`pnpm changeset`).

## CHM fixtures

Integration tests use `fixtures/PowerCollections.chm`. If missing locally, e2e tests download it on first run. CI expects the fixture to be present or downloadable.

## License

By contributing, you agree that your contributions are licensed under LGPL-2.1-only, consistent with this project.
