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

When a Pi run settles (no automatic retry, compaction recovery, or queued continuation left), the plugin atomically replaces one `AGENT_DONE` marker in a configurable directory.

The marker contains a short metadata record identifying the latest writer: the event, session name, and session ID. Repeated settled events coalesce while a marker is pending, so an unattended directory cannot accumulate one file per turn. The metadata identifies the latest writer only.

The included script `./watch-and-notify.sh` watches the marker directory and sends Linux OS notifications (via `notify-send`) when the marker is published. It claims the marker before reading and deleting it, so a concurrent completion can publish the next marker safely. Legacy `AGENT_DONE.<suffix>` markers are still consumed and removed.

### Supported Events

| Event         | Pi event        | Marker prefix | Meaning                                                           |
| ------------- | --------------- | ------------- | ----------------------------------------------------------------- |
| Agent settled | `agent_settled` | `AGENT_DONE`  | Pi has no retry, compaction recovery, or queued continuation left |

Settled events are coalesced while a marker is pending; with the watcher running, each marker publication normally produces one notification.

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

The extension and watcher share one pending marker. If the watcher is offline, later settled events replace the metadata rather than creating additional files; the next notification identifies the latest writer.

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
- New sessions and forks start from the configured default (see the `pi-notify-marker` settings namespace and `PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT`).
- Forks that inherit an explicit override reset to the default and persist the reset, so a later reload cannot resurrect the parent's operational preference.

`/notify-marker:status` reports one of:

- `active` — explicitly unpaused.
- `paused` — explicitly paused.
- `active (default)` — no explicit override; default is active.
- `paused (default)` — no explicit override; default is paused.

Command feedback is shown via Pi UI notifications (visible in the TUI and over RPC). It is intentionally a no-op in print/JSON modes.

## Configuration

The extension's pause default uses Pi's normal settings files. The watcher and marker directory remain process or shell configuration because they may refer to different sides of a container boundary.

Add the `pi-notify-marker` namespace to global `~/.pi/agent/settings.json` or to a trusted project's `<project>/.pi/settings.json`:

```json
{
  "pi-notify-marker": {
    "pausedByDefault": true
  }
}
```

Project settings override the global value. Set `pausedByDefault` to `true` to start sessions paused; `false` or an omitted value means active. Changes apply after `/reload` or a restart. Invalid values produce a warning and use the lower-priority environment fallback or active default.

The existing `PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT` environment variable remains supported as a process-level override. Recognized truthy values (case-insensitive, surrounding whitespace trimmed) are `1`, `true`, `yes`, and `on`; any other value means active. When set, the environment value takes precedence over settings.

```bash
# Custom marker directory (extension side, inside the container)
PI_NOTIFY_MARKER_DIR="/path/to/some/dir" pi

# Same directory, host side, for the watcher
PI_NOTIFY_MARKER_WATCH_DIR="/path/to/some/dir" ./watch-and-notify.sh
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
