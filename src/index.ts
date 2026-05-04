/**
 * pi-notify-marker
 * Marker file plugin for Pi coding agent
 *
 * Creates marker files in a configurable directory when specific events occur.
 * Useful for external monitoring scripts to detect when Pi needs attention.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs/promises";
import * as path from "path";

const PI_NOTIFY_MARKER_DIR = process.env.PI_NOTIFY_MARKER_DIR || "/tmp/pi-notify-marker-files";

async function createMarker(eventName: string): Promise<void> {
  try {
    await fs.mkdir(PI_NOTIFY_MARKER_DIR, { recursive: true });
    const markerPath = path.join(PI_NOTIFY_MARKER_DIR, eventName);
    await fs.writeFile(
      markerPath,
      JSON.stringify({ created: new Date().toISOString() }),
    );
  } catch {
    // Silently fail - markers are best-effort
  }
}

export default function (pi: ExtensionAPI) {
  // Create marker when agent finishes
  pi.on("agent_end", async () => {
    await createMarker("AGENT_DONE");
  });

  // Create marker when agent hits a roadblock (needs user input)
  pi.on("user_bash", async () => {
    await createMarker("ROADBLOCK");
  });
}
