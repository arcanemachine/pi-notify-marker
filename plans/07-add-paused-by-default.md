# 07 — Add paused-by-default

## Objective

Allow users to keep the extension installed and configured while requiring each session to be explicitly unpaused before emitting markers.

## Files to touch

- `src/index.ts`
- `test/index.test.ts`

Documentation belongs to item 10.

## Environment variable

```text
PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT
```

Recognize these truthy values case-insensitively:

```text
1
true
yes
on
```

Trim surrounding whitespace before comparison. All other values, including unset and empty, mean false.

## Semantics

- Default-active: emit unless explicitly paused.
- Default-paused: suppress unless explicitly unpaused.
- An explicit pause always suppresses.
- An explicit unpause always emits.
- New sessions and forks start from the configured default.
- Reload/resume restore the session’s latest explicit override.

This environment variable controls the initial/default state only. It does not disable the extension or change marker-directory resolution.

## Configuration timing

Read the environment value when the extension factory is instantiated. Pi reload creates a fresh extension runtime, so an environment change visible to the process can update the default on reload; do not cache it in module-global mutable state.

Keep marker directory and default-state resolution local to each extension instance to make tests deterministic and avoid cross-session leakage.

## Status integration

With no explicit override:

- false default → `active (default)`;
- true default → `paused (default)`.

Explicit states report `active` or `paused` regardless of the environment default.

## Tests

Test every truthy spelling, mixed case, and surrounding whitespace. Also test representative falsey values:

- unset;
- empty;
- `0`;
- `false`;
- `no`;
- `off`;
- arbitrary strings.

Test the full precedence matrix:

| Default | Override | Effective state |
| --- | --- | --- |
| active | none | active |
| active | paused | paused |
| active | active | active |
| paused | none | paused |
| paused | paused | paused |
| paused | active | active |

Restore environment variables after every test to avoid cross-test pollution.

## Acceptance criteria

- Default behavior remains active when the variable is absent.
- Explicit commands override the default.
- The setting is per Pi process environment and does not create shared files.
- No disabled state is introduced.

## Future-agent cautions

- Do not treat `PI_NOTIFY_MARKER_DIR` falsey values as disabled as part of this work.
- Do not copy Claude-specific environment names or settings-file examples.
