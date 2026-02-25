/**
 * pi-notify-marker
 * Marker file plugin for Pi coding agent
 *
 * Creates marker files in a configurable directory when specific events occur.
 * Useful for external monitoring scripts to detect when Pi needs attention.
 *
 * Creates marker files:
 * - .pi/notify-marker-idle: Agent finished successfully
 * - .pi/notify-marker-roadblock: Agent needs user input (user_bash event)
 *
 * These marker files can be monitored by external tools to trigger notifications.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs/promises";
import * as path from "path";

const MARKER_DIR = process.env.MARKER_DIR || "/workspace/tmp/pi-notify-marker-files";

interface MarkerConfig {
  /** Create markers for child/sub-session events (default: false) */
  notifyChildSessions?: boolean;
}

const DEFAULT_CONFIG: MarkerConfig = {
  notifyChildSessions: false,
};

async function loadConfig(): Promise<MarkerConfig> {
  const configPath = path.join(
    typeof process.env.HOME !== "undefined" ? process.env.HOME : "/root",
    ".pi",
    "agent",
    "pi-notify-marker.json",
  );

  try {
    const content = await fs.readFile(configPath, "utf8");
    const userConfig = JSON.parse(content) as Partial<MarkerConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function createMarker(eventName: string): Promise<void> {
  try {
    await fs.mkdir(MARKER_DIR, { recursive: true });
    const markerPath = path.join(MARKER_DIR, eventName);
    await fs.writeFile(markerPath, JSON.stringify({ created: new Date().toISOString() }));
  } catch {
    // Silently fail - markers are best-effort
  }
}

export default function (pi: ExtensionAPI) {
  const config = loadConfig();

  // Create marker when agent finishes
  pi.on("agent_end", async () => {
    await createMarker("AGENT_DONE");
  });

  // Create marker when agent hits a roadblock (needs user input)
  pi.on("user_bash", async () => {
    await createMarker("ROADBLOCK");
  });
}
