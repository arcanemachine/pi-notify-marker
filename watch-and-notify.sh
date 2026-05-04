#!/bin/bash

# Customize marker directory with PI_NOTIFY_MARKER_WATCH_DIR environment variable
PI_NOTIFY_MARKER_WATCH_DIR="${PI_NOTIFY_MARKER_WATCH_DIR:-/tmp/pi-notify-marker-files}"

# Ensure directory exists
mkdir -p "$PI_NOTIFY_MARKER_WATCH_DIR"

# Remove existing marker files on startup
remove_existing_markers() {
    shopt -s nullglob
    local count=0
    for file in "$PI_NOTIFY_MARKER_WATCH_DIR"/*; do
        if [ -f "$file" ]; then
            count=$((count + 1))
            rm "$file"
        fi
    done
    shopt -u nullglob
    if [ $count -gt 0 ]; then
        echo "Removed $count existing marker file(s) on startup."
    fi
}

# Remove existing markers on startup
echo "Watching marker directory: $PI_NOTIFY_MARKER_WATCH_DIR"
remove_existing_markers

# Check if inotifywait is available
if command -v inotifywait &> /dev/null; then
    echo "Using inotifywait to watch files."
    inotifywait -m -e create --format '%f' "$PI_NOTIFY_MARKER_WATCH_DIR" | while read -r file; do
        filename=$(basename "$file")
        notify-send -t 15000 "Pi event handler" "\nEvent: $filename\n\nTimestamp: $(date --iso-8601=seconds)"
        rm "$PI_NOTIFY_MARKER_WATCH_DIR/$file"
    done
else
    echo "inotifywait not found, using polling fallback..."
    while true; do
        shopt -s nullglob
        for file in "$PI_NOTIFY_MARKER_WATCH_DIR"/*; do
            if [ -f "$file" ]; then
                filename=$(basename "$file")
                notify-send -t 15000 "Pi" "\nEvent: $filename\n\nTimestamp: $(date --iso-8601=seconds)"
                rm "$file"
            fi
        done
        shopt -u nullglob
        sleep 2
    done
fi
