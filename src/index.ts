/**
 * pi-notify-marker
 * Marker file plugin for Pi coding agent
 *
 * Creates marker files in a configurable directory when a Pi run settles.
 * Useful for external monitoring scripts to detect when the agent has finished.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "fs/promises";
import * as path from "path";

const PI_NOTIFY_MARKER_DIR =
  process.env.PI_NOTIFY_MARKER_DIR || "/tmp/pi-notify-marker-files";

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
  // Create marker when the agent run settles
  pi.on("agent_settled", async () => {
    await createMarker("AGENT_DONE");
  });
}
