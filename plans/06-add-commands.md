# 06 — Add commands

## Objective

Expose concise per-session controls through Pi extension commands.

## Files to touch

- `src/index.ts`
- `test/index.test.ts`

Documentation belongs to item 10.

## Commands

Register these exact names:

- `/notify-marker:pause`
- `/notify-marker:unpause`
- `/notify-marker:status`

Current Pi parses a command name as everything between `/` and the first space, so colons are valid. Do not replace these with one argument-driven command unless requirements change.

## Command behavior

### Pause

1. Set the in-memory override to `"paused"`.
2. Append the state entry through `pi.appendEntry()`.
3. Notify:

```text
notify-marker: paused
```

### Unpause

1. Set the in-memory override to `"active"`.
2. Append the state entry.
3. Notify:

```text
notify-marker: unpaused
```

Use “unpause,” not “resume,” because Pi already uses `/resume` for session switching.

### Status

Do not mutate or append state. Report one of:

```text
active
paused
active (default)
paused (default)
```

The plain forms mean an explicit override; the parenthesized forms mean no override and show the configured default.

## UI behavior

Use `ctx.ui.notify(message, "info")` for terse feedback.

- TUI: visible notification.
- RPC: extension UI notification.
- Print/JSON: UI notification is intentionally a no-op.

Do not use `console.log()` as a fallback because it can corrupt machine-readable JSON output.

## Streaming behavior

Pi executes extension commands before normal prompt processing, including while an agent run is active. A pause entered during streaming should suppress the eventual `agent_settled` marker. Do not wait for idle before changing pause state.

## Tests

Capture registered commands from a mock `ExtensionAPI` and invoke their handlers directly.

Test:

- exact registered names and descriptions;
- pause state, appended data, and notification;
- unpause state, appended data, and notification;
- idempotent repeated pause/unpause behavior;
- status output for explicit and default states;
- status appends no entry;
- pausing before a pending settled handler prevents marker creation;
- unpausing restores marker creation.

Repeated commands may append repeated intent entries; correctness matters more than deduplicating a tiny append-only state log. If deduplication is introduced, test it explicitly and keep notifications idempotent.

## Acceptance criteria

- All three commands appear in Pi command discovery/autocomplete.
- Commands affect only the active Pi session.
- Feedback is terse and consistent.
- No command triggers an LLM turn.

## Future-agent cautions

- Do not call session replacement APIs from these handlers.
- Do not use command output to create custom messages in model context.
- Duplicate command registrations are resolved by Pi; do not implement custom namespacing logic.
