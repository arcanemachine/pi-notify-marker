# 10 — Update documentation

## Objective

Document the completed behavior accurately for Pi users running the extension in containers and the watcher on a Linux host.

## Files to touch

- `README.md`

Do not bump the package version in this item.

## Required documentation changes

### Overview

- Describe the package as creating markers when Pi fully settles.
- Remove claims that it detects roadblocks or generic attention requirements.
- Keep the container-to-host notification use case central.

### How it works

Explain:

- marker filenames are `AGENT_DONE.<unique-suffix>`;
- unique suffixes prevent concurrent sessions from clobbering events;
- marker contents contain the session name or session ID;
- the watcher displays the logical event and session label, then deletes the marker.

### Supported events

The table should contain only:

| Event | Pi event | Marker prefix | Meaning |
| --- | --- | --- | --- |
| Agent settled | `agent_settled` | `AGENT_DONE` | Pi has no retry, compaction recovery, or queued continuation left |

Do not mention ROADBLOCK except, if needed, in migration notes stating that it was removed because Pi has no reliable corresponding event.

### Requirements

Document:

- a Pi version supporting `agent_settled` (verified minimum: 0.80.10);
- Linux host notification support through `notify-send`;
- optional `inotifywait`, with polling fallback;
- optional `flock`, with reduced duplicate-watcher protection when absent.

Keep wording evergreen: describe required capabilities and stable minimums, not workspace commit hashes or transient checkout details.

### Configuration

Retain:

- `PI_NOTIFY_MARKER_DIR` for the extension;
- `PI_NOTIFY_MARKER_WATCH_DIR` for the watcher;
- the existing default directory.

Add:

- `PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT`;
- accepted truthy values;
- default-active and default-paused examples.

Pi settings do not provide a Claude-style environment map. Show shell, container, Compose, or host environment examples rather than inventing `.pi/settings.json` environment keys.

Continue warning against ambiguous `~` expansion and recommend matching absolute paths on both sides.

### Commands

Add a table for:

- `/notify-marker:pause`;
- `/notify-marker:unpause`;
- `/notify-marker:status`.

Explain:

- state is per Pi session;
- explicit state survives reload/resume;
- new sessions and forks use the configured default;
- status distinguishes explicit and default state;
- command feedback is intended for TUI/RPC use.

### Installation and development

Keep existing GitHub, npm, and local installation instructions unless current Pi package syntax requires a correction.

Update development instructions to include:

```bash
npm install --loglevel=warn
npm test
```

Do not claim that normal package installation pulls the Pi dependency tree; Pi remains an optional peer/runtime-provided package.

## Documentation tests/review

- Verify every environment variable matches source exactly.
- Verify command names match registration exactly.
- Verify event terminology says “settled,” not “successfully completed.”
- Verify watcher and extension default directories match.
- Verify no Claude-specific settings paths or variable prefixes remain.
- Verify no disabled-state behavior is documented.

## Acceptance criteria

- README describes only implemented behavior.
- Concurrent-session and attribution behavior are understandable without reading source.
- Both default-active and default-paused workflows are actionable.
- Requirements are stable and free of ephemeral repository references.

## Future-agent cautions

- Do not copy sibling-project documentation verbatim; Claude hooks, environment settings, and session cleanup differ from Pi.
- Do not promise generic “needs input” notifications.
