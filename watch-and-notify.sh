#!/bin/bash

# Watch a marker directory and emit desktop notifications when Pi writes
# completion markers there. Linux-oriented: uses notify-send.
#
# Customize the marker directory with PI_NOTIFY_MARKER_WATCH_DIR.

PI_NOTIFY_MARKER_WATCH_DIR="${PI_NOTIFY_MARKER_WATCH_DIR:-/tmp/pi-notify-marker-files}"

mkdir -p "$PI_NOTIFY_MARKER_WATCH_DIR"

# Single-instance guard: hold an exclusive lock on a dotfile for the lifetime of
# this process. Skip when flock is unavailable.
if command -v flock &>/dev/null; then
  exec 9>"$PI_NOTIFY_MARKER_WATCH_DIR/.watcher.lock"
  if ! flock -n 9; then
    echo "Another notify-marker watcher is already running on $PI_NOTIFY_MARKER_WATCH_DIR" >&2
    exit 1
  fi
fi

# Strip the unique suffix from a marker filename to get the logical event.
# "AGENT_DONE.abc" -> "AGENT_DONE"; "AGENT_DONE" -> "AGENT_DONE".
marker_event() {
  printf '%s' "${1%%.*}"
}

# Read a marker's session label. Fall back to "unknown" if empty or unreadable.
read_label() {
  local path="$1"
  local label
  label="$(cat -- "$path" 2>/dev/null)"
  if [ -n "$label" ]; then
    printf '%s' "$label"
  else
    printf '%s' "unknown"
  fi
}

# Consume one marker: notify with the logical event + session label, then delete it.
consume_marker() {
  local file="$1"
  local path="$PI_NOTIFY_MARKER_WATCH_DIR/$file"
  local event
  local label
  event="$(marker_event "$file")"
  label="$(read_label "$path")"
  notify-send -t 15000 "Pi event handler" "Session: $label

Event: $event

Timestamp: $(date --iso-8601=seconds)"
  rm -f -- "$path"
}

# Remove non-dot regular marker files already present on startup.
remove_existing_markers() {
  local count=0
  shopt -s nullglob
  for file in "$PI_NOTIFY_MARKER_WATCH_DIR"/*; do
    if [ -f "$file" ]; then
      count=$((count + 1))
      rm -f -- "$file"
    fi
  done
  shopt -u nullglob
  if [ $count -gt 0 ]; then
    echo "Removed $count existing marker file(s) on startup."
  fi
}

echo "Watching marker directory: $PI_NOTIFY_MARKER_WATCH_DIR"
remove_existing_markers

if command -v inotifywait &>/dev/null; then
  echo "Using inotifywait to watch files."
  inotifywait -m -e close_write --format '%f' "$PI_NOTIFY_MARKER_WATCH_DIR" | while read -r file; do
    # Ignore dotfiles (including our own .watcher.lock).
    case "$file" in
      .*) continue ;;
    esac
    consume_marker "$file"
  done
else
  echo "inotifywait not found, using polling fallback..."
  while true; do
    shopt -s nullglob
    for file in "$PI_NOTIFY_MARKER_WATCH_DIR"/*; do
      if [ -f "$file" ]; then
        consume_marker "$(basename "$file")"
      fi
    done
    shopt -u nullglob
    sleep 2
  done
fi