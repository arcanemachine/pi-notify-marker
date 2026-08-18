# pi-notify-marker

<p align="center">
  <img src="https://raw.githubusercontent.com/arcanemachine/pi-notify-marker/main/logo.jpg" alt="pi-notify-marker logo" width="250" />
</p>

> Marker file plugin for Pi coding agent - create files when a Pi run settles.

A plugin for [Pi](https://github.com/badlogic/pi-mono) that creates marker files when a Pi run settles. Useful for external monitoring scripts to detect when the agent has finished (e.g. when running Pi in a container where native OS notifications cannot be triggered).

This project is similar to [opencode-notify-marker](https://github.com/arcanemachine/opencode-notify-marker) but for Pi coding agent.

> Like this extension? See [my other Pi extensions](https://github.com/arcanemachine/pi-projects).

## Why This Exists

So that you can run Pi in a container, and still have a means of getting OS notifications on the host.

## How It Works

When a Pi run settles (no automatic retry, compaction recovery, or queued continuation left), the plugin creates a uniquely named marker file in a configurable directory.

Marker filenames are `AGENT_DONE.<unique-suffix>`. The unique suffix lets concurrent Pi sessions share a marker directory without clobbering each other's events. Each marker's contents are a plain-text session label — the current Pi session name when set, otherwise the session ID.

The included script `./watch-and-notify.sh` watches the marker directory and sends Linux OS notifications (via `notify-send`) when files are created. It strips the unique suffix from the filename, displays the logical event together with the session label, then deletes the marker.

### Supported Events

| Event         | Pi event        | Marker prefix | Meaning                                                           |
| ------------- | --------------- | ------------- | ----------------------------------------------------------------- |
| Agent settled | `agent_settled` | `AGENT_DONE`  | Pi has no retry, compaction recovery, or queued continuation left |

One marker is created per settled turn, so a multi-turn run produces one marker per turn.

## Installation

### From GitHub (Recommended)

```bash
pi install git:github.com/arcanemachine/pi-notify-marker
```

To update to the latest version:

```bash
pi update git:github.com/arcanemachine/pi-notify-marker
```

### From npm

```bash
pi install npm:@arcanemachine/pi-notify-marker
```

To update to the latest version:

```bash
pi update npm:@arcanemachine/pi-notify-marker
```

### From Local Clone

```bash
git clone https://github.com/arcanemachine/pi-notify-marker.git
cd pi-notify-marker
pi install /path/to/pi-notify-marker
```

No local `npm install` is required for normal usage.

## Usage

If you want desktop notifications when an agent run settles:

1. Start Pi in the container with `PI_NOTIFY_MARKER_DIR` pointing at a host-mounted directory.
2. Run `watch-and-notify.sh` from the host with `PI_NOTIFY_MARKER_WATCH_DIR` pointing at the same directory.

## Requirements

- A Pi version that supports the `agent_settled` event (0.80.10 or later).
- Linux host notification support through `notify-send`.
- Optional `inotifywait` for efficient file watching; the watcher falls back to polling when it is absent.
- Optional `flock` for single-instance protection; without it, two watchers on the same directory can emit duplicate notifications.

## Commands

The extension registers three slash commands:

| Command                  | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `/notify-marker:pause`   | Suppress completion notifications for this session. |
| `/notify-marker:unpause` | Resume completion notifications for this session.   |
| `/notify-marker:status`  | Show the current pause state for this session.      |

Pause state is per Pi session and persisted in the session itself:

- An explicit pause or unpause survives `/reload` and `/resume`.
- New sessions and forks start from the configured default (see `PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT`).
- Forks that inherit an explicit override reset to the default and persist the reset, so a later reload cannot resurrect the parent's operational preference.

`/notify-marker:status` reports one of:

- `active` — explicitly unpaused.
- `paused` — explicitly paused.
- `active (default)` — no explicit override; default is active.
- `paused (default)` — no explicit override; default is paused.

Command feedback is shown via Pi UI notifications (visible in the TUI and over RPC). It is intentionally a no-op in print/JSON modes.

## Configuration

The plugin and watcher are configured through the process, shell, or container environment. Pi does not provide a settings-file environment map.

```bash
# Custom marker directory (extension side, inside the container)
PI_NOTIFY_MARKER_DIR="/path/to/some/dir" pi

# Same directory, host side, for the watcher
PI_NOTIFY_MARKER_WATCH_DIR="/path/to/some/dir" ./watch-and-notify.sh
```

### Pause by default

`PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT` controls the state sessions start in when there is no explicit override. Recognized truthy values (case-insensitive, surrounding whitespace trimmed): `1`, `true`, `yes`, `on`. Any other value, including unset and empty, means active.

```bash
# Default active (default)
pi

# Default paused: each session must be explicitly unpaused before markers are emitted
PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT=1 pi
```

An explicit `/notify-marker:pause` always suppresses and an explicit `/notify-marker:unpause` always emits, regardless of the configured default.

Note: `~` may not be expanded in all environments. Prefer absolute paths. Relative paths and `$HOME/...` can also work, but make sure Pi and the watcher resolve to the same directory.

## Development install (optional)

If you are editing the extension itself, install dev tooling only:

```bash
npm install --loglevel=warn
npm test
```

This package keeps `@earendil-works/pi-coding-agent` as an optional peer to avoid pulling a large dependency tree during normal installs.

Tests use Node's built-in `node:test` runner with `tsx`; no model requests, desktop notifications, or persistent host directories are used.
