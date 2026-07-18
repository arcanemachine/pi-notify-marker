# 01 — Update development tooling

## Objective

Make development and testing reproducible against the supported Pi extension API while preserving the package’s runtime installation model.

## Scope

- Add a development-time Pi dependency that exposes the APIs used by this work.
- Add lightweight TypeScript test execution.
- Add a separate test type-check configuration so tests do not enter production build output.
- Do not add runtime dependencies.
- Do not add compatibility shims for older Pi APIs.

## Files to touch

- `package.json`
- `tsconfig.test.json` — new

Do not touch `src/index.ts` in this item.

## Confirmed constraints

- `agent_settled` is required; the implementation must target a Pi release that provides it.
- Keep `@earendil-works/pi-coding-agent` as an optional peer with the Pi package convention of `"*"`.
- Add a development dependency on a current compatible Pi release. `^0.80.10` is the verified minimum available during planning; if the workspace has advanced, use the current compatible release rather than adding old-API support.
- Use Node’s native `node:test` API with `tsx`, consistent with neighboring Pi packages.
- The repository currently has no lockfile. Do not introduce `package-lock.json` without explicit approval.

## Planned `package.json` changes

1. Preserve existing `build` and `watch` scripts.
2. Add a `test` script that:
   - type-checks source and tests with `tsconfig.test.json`;
   - runs `test/*.test.ts` through Node’s test runner using `tsx`.
3. Add development dependencies:
   - `@earendil-works/pi-coding-agent` at the current supported development version;
   - `tsx` at the workspace-compatible current version.
4. Preserve the optional peer dependency and `peerDependenciesMeta` entries.
5. Do not bump the package version in this item.

Suggested command shape:

```json
"test": "tsc -p tsconfig.test.json && node --import tsx --test test/*.test.ts"
```

The script should be added together with item 09 (add tests), or otherwise delayed until at least one matching test file exists.

## Planned `tsconfig.test.json`

- Extend `./tsconfig.json`.
- Set `noEmit: true`.
- Include both `src/**/*.ts` and `test/**/*.ts`.
- Exclude `node_modules` and `dist`.
- Do not change the production `tsconfig.json` include list merely to type-check tests; production builds should not emit test files.

## Verification

After item 09 provides tests:

```bash
npm test
npx tsc --noEmit
```

Also verify that a normal build still compiles only production source.

## Acceptance criteria

- Source compiles against the supported Pi declarations containing `agent_settled`.
- Tests type-check and run without Vitest or another test framework.
- Production builds do not emit test files.
- Normal package consumers still do not install Pi as a required runtime dependency.
- No lockfile is introduced unintentionally.

## Future-agent cautions

- Do not weaken types or cast `pi.on()` to bypass an outdated declaration package; update the development dependency instead.
- Do not retain `agent_end` as a fallback.
- Do not move the Pi package from optional peer dependencies into runtime dependencies.
