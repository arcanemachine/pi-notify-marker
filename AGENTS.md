# Agent Instructions

## Workflow

Commit when a task is completed.

## Verification

Run before completion:

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
npm pack --dry-run
```

## Commit Style

Match existing commits:

- `Add pi-package manifest to package.json`
- `Update README with GitHub installation instructions`
- `Format code with Prettier`
