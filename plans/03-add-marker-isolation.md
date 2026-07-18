# 03 — Add marker isolation

## Objective

Prevent marker loss when multiple Pi processes or rapid events write into the same marker directory.

## Problem

A fixed filename such as `AGENT_DONE` is overwritten by later writes before the watcher consumes it. Separate Pi processes may share the same host-mounted marker directory, so in-process serialization is insufficient.

## Files to touch

- `src/index.ts`
- `test/index.test.ts`

Watcher display changes belong to item 08.

## Marker filename contract

Write markers as:

```text
<EVENT>.<unique-suffix>
```

For this package, the only event after item 02 is:

```text
AGENT_DONE.<unique-suffix>
```

Use a process-independent random suffix, preferably `randomUUID()` from `node:crypto`.

## Implementation steps

1. Import `randomUUID` from `node:crypto`.
2. Construct a new filename for every event.
3. Use `fs.writeFile()` with `{ flag: "wx" }` so a theoretical collision cannot overwrite an existing marker.
4. Keep directory creation recursive.
5. Keep all marker filesystem work inside the existing best-effort error boundary.
6. Do not enumerate, replace, or delete other marker files from the extension.
7. Do not include session IDs in filenames; attribution belongs in file contents and should not leak into shell-visible names unnecessarily.
8. Do not use only `Date.now()` or only the process ID as the suffix; either can collide.

## Concurrency behavior

- Every settled event represents one marker file.
- Concurrent extension instances writing to the same directory must produce distinct files.
- Existing files must never be truncated or replaced.
- The watcher remains the sole consumer responsible for deletion.

## Tests

Using a temporary marker directory:

1. Invoke marker creation repeatedly in parallel and assert the number of files equals the number of invocations.
2. Assert every basename starts with `AGENT_DONE.`.
3. Assert all basenames are unique.
4. Assert pre-existing marker files remain unchanged.
5. Assert a directory absent before emission is created automatically.
6. Assert an unwritable or invalid target does not reject the extension handler.

Avoid asserting the exact random suffix.

## Acceptance criteria

- No normal concurrent write can clobber another event.
- Marker creation remains silent and best-effort on filesystem failures.
- Marker names remain easy for the watcher to reduce to the logical event name.

## Future-agent cautions

- Do not solve collisions with a shared counter; counters are not shared across Pi processes.
- Do not clean stale files from the extension. Startup cleanup remains watcher behavior.
