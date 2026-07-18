# 09 — Add tests

## Objective

Create a focused, deterministic test suite for extension behavior, session state, filesystem concurrency, and watcher integration.

## Files to touch

- `test/index.test.ts` — new
- `test/watch-and-notify.test.ts` — new
- `package.json` — coordinate with item 01
- `tsconfig.test.json` — coordinate with item 01

Production code changes should occur only when needed for testability and must remain part of the relevant feature item.

## Test framework

Use:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
```

Run TypeScript with `tsx`. Do not add Vitest, Jest, or mocking libraries.

## Extension test harness

Build a small typed mock rather than instantiating Pi:

- capture handlers registered through `pi.on()`;
- capture commands registered through `pi.registerCommand()`;
- capture data passed to `pi.appendEntry()`;
- provide a mutable `getSessionName()` result;
- provide minimal contexts with `sessionManager.getSessionId()`, `getEntries()`, and `ui.notify()`.

Avoid `any`. A narrow mock may be cast through `unknown` to `ExtensionAPI` at its boundary, but all stored handlers and observations should have explicit local types.

Use a fresh extension instance per test when environment or session state differs.

## Filesystem isolation

- Create a unique temporary directory per test.
- Set `PI_NOTIFY_MARKER_DIR` only for that test.
- Restore every modified environment variable in cleanup.
- Remove temporary files and directories even on failure.
- Do not rely on `/tmp/pi-notify-marker-files` in tests.
- Avoid parallel execution for tests that mutate `process.env`, or serialize those cases explicitly.

## Required extension tests

### Registration and lifecycle

- registers `agent_settled`;
- does not register `agent_end`;
- does not register `user_bash`;
- registers the three exact commands.

### Marker behavior

- creates the directory recursively;
- emits one uniquely named `AGENT_DONE.*` file per settled event;
- concurrent writes do not collide;
- uses exclusive creation and preserves existing files;
- silently tolerates filesystem failure.

### Attribution

- session name is written when available;
- session ID is the fallback;
- renamed sessions use the latest name.

### State restoration

- restores latest valid custom state on startup/reload/resume;
- ignores malformed state;
- resets on new;
- resets and persists reset on fork when inherited state exists;
- remains independent of tree navigation semantics by using latest append order.

### Commands and defaults

- pause/unpause append correct state and notify tersely;
- status does not append;
- status distinguishes explicit/default state;
- truthy environment parsing and false cases;
- explicit override precedence;
- paused state suppresses marker creation.

## Required watcher tests

Spawn `watch-and-notify.sh` with fake executables placed first in `PATH`.

- Fake `notify-send` records argv/body to a temporary file.
- Fake `inotifywait` creates or exposes a marker, emits its basename once, then exits so the watcher terminates.
- Never call the real `notify-send`.

Cover syntax, suffix stripping, label display, deletion, startup cleanup, dotfile preservation, and the optional `flock` guard. Bound every child process with a timeout and terminate it during cleanup.

## Assertions to avoid

- exact UUID values;
- exact wall-clock timestamps;
- ordering between independent filesystem directory entries;
- availability of `inotifywait` or `flock` on every environment without a fake/skip condition;
- Pi internal implementation details beyond the public extension contract.

## Verification

```bash
npm test
bash -n watch-and-notify.sh
npx tsc --noEmit
```

Tests must be run after creating or modifying them, per repository instructions.

## Acceptance criteria

- Tests fail against the old behavior and pass against the completed implementation.
- No paid provider, model request, desktop notification, or persistent host directory is used.
- Test failures leave no watcher processes or temporary directories behind.
- Test source is type-checked but excluded from production build output.

## Future-agent cautions

- Do not export a broad new public API solely for tests. Prefer testing the default extension through registered handlers and commands.
- If a small pure helper must be exported, document why and keep its contract narrow.
