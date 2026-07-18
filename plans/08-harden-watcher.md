# 08 — Harden watcher

## Objective

Make `watch-and-notify.sh` safely consume unique, session-attributed markers without duplicate watcher instances or partial reads.

## Files to touch

- `watch-and-notify.sh`
- `test/watch-and-notify.test.ts` — created under item 09

## Required behavior

### Single-instance guard

After ensuring the watch directory exists:

1. If `flock` is available, open a lock file such as `.watcher.lock` on a dedicated file descriptor.
2. Acquire a non-blocking exclusive lock held for the watcher lifetime.
3. Exit non-zero with a concise message when another watcher holds the lock.
4. If `flock` is unavailable, continue without locking.

The lock file is a dotfile and must never be treated as a marker or startup-cleanup target.

### Event-name parsing

Marker names use `<EVENT>.<unique-suffix>`. Add a helper equivalent to:

```bash
marker_event() {
    printf '%s' "${1%%.*}"
}
```

Legacy names without a dot naturally display unchanged; no separate compatibility branch is needed.

### Session-label parsing

Read marker file contents as plain text. If empty or unreadable, display `unknown`.

Do not introduce `jq` or another parser dependency.

### Inotify behavior

- Watch `close_write`, not `create`, so contents are complete before reading.
- Ignore dotfiles explicitly.
- Read the label before deleting the marker.
- Quote all paths.
- Delete only the consumed marker.

### Polling fallback

Apply the same event parsing, session-label display, title, and deletion behavior as the inotify path. Shell globbing should continue excluding dotfiles.

### Notification format

Use one consistent title in both paths, for example `Pi event handler`, and include:

- `Session: <label>`
- `Event: <logical-event>`
- notification timestamp

Keep the existing 15-second timeout unless requirements change.

### Startup cleanup

Continue deleting non-dot regular files already present when the watcher starts. Do not delete `.watcher.lock` or any other dotfile.

## Failure and race considerations

- A marker may disappear before it is read; use `unknown` rather than failing the watcher.
- Do not add `set -e`; expected best-effort commands should not terminate the long-running watcher.
- Use `rm -- "$path"` style protection where practical.
- Do not delete all matching event files after one notification.

## Tests

Use Node tests to spawn the script with a temporary directory and a controlled `PATH` containing fake `inotifywait` and `notify-send` executables.

Test:

1. `bash -n watch-and-notify.sh` succeeds.
2. A suffixed marker displays the logical event without its suffix.
3. Marker content appears as the session label.
4. The marker is deleted after notification.
5. Dotfiles are ignored and survive startup cleanup.
6. Existing ordinary markers are removed during startup cleanup.
7. The inotify path responds after the fake close-write event.
8. If `flock` exists, a second watcher on the same directory exits non-zero while the first holds the lock.
9. Notification title/body are identical in intent across inotify and polling code paths; avoid a permanently running polling test unless it can be bounded reliably.

Do not invoke the user’s real desktop notification service from tests.

## Acceptance criteria

- Multiple watcher instances cannot duplicate notifications when `flock` is available.
- Marker contents are fully written before reading.
- Unique suffixes are never shown as part of the event name.
- Session attribution is displayed consistently.
- Polling remains a functional fallback.

## Future-agent cautions

- The watcher is Linux-oriented because it uses `notify-send`; do not broaden platform scope in this item.
- Do not move marker consumption into the Pi extension.
