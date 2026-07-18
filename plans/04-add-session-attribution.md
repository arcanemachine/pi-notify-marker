# 04 — Add session attribution

## Objective

Allow host notifications to identify which Pi session emitted an event.

## Files to touch

- `src/index.ts`
- `test/index.test.ts`

Watcher presentation changes belong to item 08.

## Confirmed Pi APIs

- `pi.getSessionName(): string | undefined`
- `ctx.sessionManager.getSessionId(): string`

The session name can change during a running session, so resolve it when the marker event fires rather than caching it at extension load or session start.

## Marker content contract

Marker contents are plain text:

1. Use the current session name when present.
2. Otherwise use the session ID.

Do not encode the payload as JSON. The host watcher should not require `jq`, Node, or another parser merely to display a label.

The watcher adds its own notification timestamp. Do not preserve the old timestamp-only JSON payload.

## Implementation steps

1. Change marker creation to accept the session label as an argument.
2. In the `agent_settled` handler, resolve:

```ts
const label = pi.getSessionName() ?? ctx.sessionManager.getSessionId();
```

3. Write the label as UTF-8 marker contents.
4. Continue using unique filenames from item 03.
5. Do not cache the initial session name.
6. Do not derive identity from the session filename or current working directory.

Pi sanitizes session names to a single line. Treat marker content as opaque display text; do not interpret it as shell code.

## Tests

- A named session writes the exact session name.
- An unnamed session writes the exact session ID.
- A session renamed between two settled events uses the new name on the second marker.
- Names containing spaces remain intact.
- Two sessions sharing a marker directory retain their distinct contents and filenames.

## Acceptance criteria

- Every emitted marker contains a non-empty session label.
- Attribution reflects the session at event time.
- The host watcher can display the label with only standard shell tools.

## Future-agent cautions

- Do not expose the session ID in the marker filename.
- Do not fall back to `unknown` inside the extension; a Pi session always has an ID. `unknown` is only a watcher fallback for malformed or legacy files.
