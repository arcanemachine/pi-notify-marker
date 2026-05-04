# pi-notify-marker

<p align="center">
  <img src="https://raw.githubusercontent.com/arcanemachine/pi-notify-marker/main/logo.jpg" alt="pi-notify-marker logo" width="250" />
</p>

> Marker file plugin for Pi coding agent - create files when Pi events occur.

A plugin for [Pi](https://github.com/badlogic/pi-mono) that creates marker files when specific events occur. Useful for external monitoring scripts to detect when the AI needs attention (e.g. when running Pi in a container where native OS notifications cannot be triggered).

This project is similar to [opencode-notify-marker](https://github.com/arcanemachine/opencode-notify-marker) but for Pi coding agent.

## Why This Exists

So that you can run Pi in a container, and still have a means of getting OS notifications on the host.

## How It Works

The plugin automatically creates marker files in a custom directory when certain Pi events occur (e.g. agent has finished a task).

The included script `./watch-and-notify.sh` watches the marker directory and sends Linux OS notifications (via `notify-send`) when files are created. It automatically deletes the marker file after showing the notification.

### Supported Events

| Event        | Marker File    | Description                          |
| ------------ | -------------- | ------------------------------------ |
| Agent done   | `AGENT_DONE`   | Agent finished successfully          |
| Roadblock    | `ROADBLOCK`    | Agent needs user input               |

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

If you want desktop notifications when the agent finishes:

1. Start Pi in the container.

2. Run `watch-and-notify.sh` from the host.

## Development install (optional)

If you are editing the extension itself, install dev tooling only:

```bash
npm install --loglevel=warn
```

This package keeps `@mariozechner/pi-coding-agent` as an optional peer to avoid pulling a large dependency tree during normal installs.

## Directory config

```bash
# Start Pi with custom marker directory
PI_NOTIFY_MARKER_DIR="/path/to/some/dir" pi

# Run watcher script pointing to the same directory
PI_NOTIFY_MARKER_WATCH_DIR="/path/to/some/dir" ./watch-and-notify.sh
```
