# 05 — Add pause state

## Objective

Provide per-session active/paused state using Pi-native session persistence, without shared marker-directory state files.

## Files to touch

- `src/index.ts`
- `test/index.test.ts`

Commands are added in item 06. Environment defaults are added in item 07.

## State model

Use one custom entry type owned by this extension, for example:

```text
pi-notify-marker:state
```

Use a small, validated data shape:

```ts
interface MarkerStateEntry {
  override: "active" | "paused" | null;
}
```

Meaning:

- `"active"`: explicitly unpaused;
- `"paused"`: explicitly paused;
- `null`: no explicit override; use the configured default.

Custom entries do not enter LLM context and require no renderer.

## Runtime state

Keep the current override in the extension instance. Marker emission should use a single helper that combines:

- explicit override, if present;
- configured default, otherwise.

Avoid duplicating state checks between commands and event handlers.

## Restoration behavior

Handle `session_start`:

- `startup`: restore the latest valid state entry if present; otherwise use the configured default.
- `reload`: restore the latest valid state entry.
- `resume`: restore the latest valid state entry.
- `new`: reset to no override.
- `fork`: reset to no override rather than inheriting the parent’s operational preference.

For forked sessions, Pi may copy custom entries along the selected branch. Append a reset entry when inherited notify-marker state exists so a later reload cannot resurrect the copied override.

Use `ctx.sessionManager.getEntries()` in reverse append order, not `getBranch()`. Pause is operational session state and should not change merely because the user navigates with `/tree`.

## Validation

When restoring entries:

- require `entry.type === "custom"`;
- require the exact custom type;
- require `data` to be an object with `override` equal to `"active"`, `"paused"`, or `null`;
- ignore malformed or future-unknown entries safely;
- stop at the latest valid matching entry.

Do not use `any`.

## Persistence behavior

Commands will call `pi.appendEntry()` only when changing explicit state. Status checks must not append entries.

Do not create:

- `.paused-sessions`;
- `.active-sessions`;
- hidden per-session files in the marker directory.

Do not register `session_shutdown` solely for pause-state cleanup. Pi session entries have no stale external IDs to clean.

## Tests

- Default state is active before item 07 changes it.
- Latest valid entry wins.
- Malformed entries are ignored.
- Reload and resume restore explicit active/paused state.
- New sessions reset to default.
- Forks reset to default even when copied entries contain an explicit override.
- Tree-like entry histories do not alter the latest operational state unexpectedly.
- Status reads do not append state.

## Acceptance criteria

- State is isolated by Pi session.
- No cross-process shared list is needed.
- Reload/resume preserve state.
- New/fork use the configured default.
- State never enters model context.

## Future-agent cautions

- `pi.appendEntry()` advances the session tree leaf; this is normal extension behavior. Keep entries minimal.
- Do not delete event marker files during session transitions.
- Do not make state branch-sensitive unless the product semantics are explicitly changed.
