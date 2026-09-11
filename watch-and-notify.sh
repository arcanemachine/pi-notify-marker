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

# Strip the unique suffix from a legacy marker filename to get the logical event.
# "AGENT_DONE.abc" -> "AGENT_DONE"; "AGENT_DONE" -> "AGENT_DONE".
marker_event() {
  printf '%s' "${1%%.*}"
}

is_marker_name() {
  case "$1" in
    AGENT_DONE|AGENT_DONE.*) return 0 ;;
    *) return 1 ;;
  esac
}

# Move a marker out of the shared name before reading it. A concurrent write can
# then publish the next marker without being removed by this notification.
claim_marker() {
  local file="$1"
  local path="$PI_NOTIFY_MARKER_WATCH_DIR/$file"
  local claim="$PI_NOTIFY_MARKER_WATCH_DIR/.AGENT_DONE.claim.$$.$RANDOM"
  if [ ! -f "$path" ]; then
    return 1
  fi
  if ! mv -- "$path" "$claim" 2>/dev/null; then
    return 1
  fi
  printf '%s' "$claim"
}

# Consume one marker: claim it, notify with its metadata, then delete the claim.
consume_marker() {
  local file="$1"
  local claim
  local metadata
  claim="$(claim_marker "$file")" || return 0
  metadata="$(cat -- "$claim" 2>/dev/null)" || metadata=""
  if [ -z "$metadata" ]; then
    metadata="Event: $(marker_event "$file")
Session: unknown"
  elif [[ "$metadata" != Event:* ]]; then
    metadata="Event: $(marker_event "$file")
Session: $metadata"
  fi
  notify-send -t 15000 "Pi event handler" "$metadata"
  rm -f -- "$claim"
}

# Remove this extension's marker and temporary files already present on startup.
remove_existing_markers() {
  local count=0
  shopt -s nullglob
  for file in \
    "$PI_NOTIFY_MARKER_WATCH_DIR/AGENT_DONE" \
    "$PI_NOTIFY_MARKER_WATCH_DIR/AGENT_DONE."* \
    "$PI_NOTIFY_MARKER_WATCH_DIR/.AGENT_DONE.tmp."* \
    "$PI_NOTIFY_MARKER_WATCH_DIR/.AGENT_DONE.claim."*; do
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
  inotifywait -m -e close_write,moved_to --format '%f' "$PI_NOTIFY_MARKER_WATCH_DIR" | while read -r file; do
    if is_marker_name "$file"; then
      consume_marker "$file"
    fi
  done
else
  echo "inotifywait not found, using polling fallback..."
  while true; do
    shopt -s nullglob
    for file in "$PI_NOTIFY_MARKER_WATCH_DIR"/*; do
      local_name="$(basename -- "$file")"
      if [ -f "$file" ] && is_marker_name "$local_name"; then
        consume_marker "$local_name"
      fi
    done
    shopt -u nullglob
    sleep 2
  done
fi