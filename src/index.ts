/**
 * pi-notify-marker
 * Marker file plugin for Pi coding agent
 *
 * Creates marker files in a configurable directory when a Pi run settles.
 * Useful for external monitoring scripts to detect when the agent has finished.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import * as fs from "fs/promises";
import * as path from "path";

const PI_NOTIFY_MARKER_DIR =
  process.env.PI_NOTIFY_MARKER_DIR || "/tmp/pi-notify-marker-files";

async function createMarker(eventPrefix: string, label: string): Promise<void> {
  try {
    await fs.mkdir(PI_NOTIFY_MARKER_DIR, { recursive: true });
    const markerPath = path.join(
      PI_NOTIFY_MARKER_DIR,
      `${eventPrefix}.${randomUUID()}`,
    );
    await fs.writeFile(markerPath, label, { flag: "wx" });
  } catch {
    // Silently fail - markers are best-effort
  }
}

export default function (pi: ExtensionAPI) {
  // Create marker when the agent run settles
  pi.on("agent_settled", async (_event, ctx) => {
    const label = pi.getSessionName() ?? ctx.sessionManager.getSessionId();
    await createMarker("AGENT_DONE", label);
  });
}
