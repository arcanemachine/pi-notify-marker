# pi-notify-marker

> Marker file plugin for Pi coding agent - create files when events occur.

A plugin for [Pi](https://github.com/badlogic/pi-mono) that creates marker files when specific events occur. Useful for external monitoring scripts to detect when the AI needs attention.

This project is similar to [opencode-notify-marker](https://github.com/arcanemachine/opencode-notify-marker) but for Pi coding agent.

## Why This Exists

You want to monitor Pi sessions from external tools (shell scripts, monitoring dashboards, etc.) but don't want to poll the API. This plugin solves that:

- **Event-driven** - External tools watch the marker files instead of polling.
- **Simple** - Just check if a file exists in `/workspace/tmp/pi-notify-marker-files/`.
- **Lightweight** - No API calls, no network requests, just file system operations.

## How It Works

The plugin automatically creates marker files in `/workspace/tmp/pi-notify-marker-files/` when certain events occur.

The included script `./watch-and-notify.sh` watches the marker directory and sends desktop notifications when files are created. It automatically deletes the marker file after showing the notification.

### Supported Events

| Event        | Marker File    | Description                          |
| ------------ | -------------- | ------------------------------------ |
| Agent done   | `AGENT_DONE`   | Agent finished successfully          |
| Roadblock    | `ROADBLOCK`    | Agent needs user input               |

## Installation

### Via Pi Package (Recommended)

Install as a pi package using the `pi install` command:

```bash
pi install /path/to/pi-notify-marker
```

Verify installation:

```bash
pi list
```

To remove later:

```bash
pi remove /path/to/pi-notify-marker
```

### First Time Setup (Clone & Install)

If you're cloning the repo for the first time:

```bash
# Clone the repository
git clone https://github.com/arcanemachine/pi-notify-marker.git

# Navigate to the project directory
cd pi-notify-marker

# Install dependencies (if needed)
npm install

# Build the extension (if needed)
npm run build

# Install as a pi package
pi install /path/to/pi-notify-marker
```

### Manual Installation

Copy the `dist/` directory to your Pi extensions folder:

```bash
cp -r /path/to/pi-notify-marker/dist ~/.pi/agent/extensions/
```

## Usage

If you want desktop notifications when the agent finishes:

1. Start Pi.

2. Run `watch-and-notify.sh`:

```bash
./watch-and-notify.sh
```

## Directory config

```bash
# Start Pi with custom marker directory
MARKER_DIR="/path/to/some/dir" pi

# Run watcher script pointing to the same directory
WATCH_DIR="/path/to/some/dir" ./watch-and-notify.sh
```

## License

MIT License

Copyright (c) 2026 arcanemachine
