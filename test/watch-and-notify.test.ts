import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  mkdtemp,
  rm,
  writeFile,
  readdir,
  readFile,
  symlink,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

const SCRIPT = join(process.cwd(), "watch-and-notify.sh");

/** Build the watcher environment. `\withSystemBin\` adds /usr/bin:/bin so real flock resolves; leave it off to keep inotifywait unfound (polling/path tests). */
function watcherEnv(opts: { withSystemBin?: boolean } = {}): NodeJS.ProcessEnv {
  const pathParts = [fakeBin];
  if (opts.withSystemBin) pathParts.push("/usr/bin", "/bin");
  return {
    ...process.env,
    PATH: pathParts.join(":"),
    PI_NOTIFY_MARKER_WATCH_DIR: markerDir,
    NOTIFY_RECORD: notifyRecord,
    // BASH_ENV/ENV source a startup file that reassigns PI_NOTIFY_MARKER_WATCH_DIR;
    // unset them so our explicit env survives shell startup.
    BASH_ENV: "",
    ENV: "",
  };
}

let markerDir: string;
let fakeBin: string;
let notifyRecord: string;
let children: ChildProcessWithoutNullStreams[];

const COREUTILS = ["cat", "date", "rm", "mkdir", "basename", "sleep"];

beforeEach(async () => {
  markerDir = await mkdtemp(join(tmpdir(), "pnm-watch-"));
  fakeBin = await mkdtemp(join(tmpdir(), "pnm-bin-"));
  notifyRecord = join(fakeBin, "notify-record");
  children = [];
  // Record each notification as: title <US> body <RS>, using control chars that
  // never appear in our notification text so multi-line bodies parse cleanly.
  await writeFakeBin(
    "notify-send",
    `#!/bin/bash
printf '%s\x1f%s\x1e' "$3" "$4" >> "${notifyRecord}"
exit 0
`,
  );
  // Symlink the coreutils the watcher needs, so PATH can be fakeBin-only (keeping
  // real inotifywait unresolvable for polling tests) while date/cat/rm/etc. work.
  for (const name of COREUTILS) {
    await symlink(`/usr/bin/${name}`, join(fakeBin, name));
  }
});

afterEach(async () => {
  for (const c of children) {
    try {
      c.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
  await rm(markerDir, { recursive: true, force: true });
  await rm(fakeBin, { recursive: true, force: true });
});

async function writeFakeBin(name: string, content: string): Promise<void> {
  const path = join(fakeBin, name);
  await writeFile(path, content, { mode: 0o755 });
}

const BASH = "/bin/bash";

function spawnWatcher(env: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
  const child = spawn(BASH, [SCRIPT], { env });
  children.push(child);
  return child;
}

async function readNotifyRecord(): Promise<{ title: string; body: string }[]> {
  if (!existsSync(notifyRecord)) return [];
  const content = await readFile(notifyRecord, "utf8");
  return content
    .split("\x1e")
    .filter(Boolean)
    .map((record) => {
      const [title, body] = record.split("\x1f");
      return { title: title ?? "", body: body ?? "" };
    });
}

function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs = 8000,
): Promise<number | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      resolve(null);
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(t);
      resolve(code);
    });
  });
}

function waitForStdout(
  child: ChildProcessWithoutNullStreams,
  needle: string,
  timeoutMs = 8000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      if (buf.includes(needle)) {
        clearTimeout(t);
        child.stdout.off("data", onData);
        resolve(true);
      }
    };
    child.stdout.on("data", onData);
    const t = setTimeout(() => {
      child.stdout.off("data", onData);
      resolve(false);
    }, timeoutMs);
  });
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs = 8000,
  intervalMs = 100,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return await predicate();
}

describe("watch-and-notify.sh", () => {
  it("passes shell syntax check", async () => {
    const child = spawn(BASH, ["-n", SCRIPT]);
    const code = await waitForExit(child, 5000);
    assert.equal(code, 0);
  });

  it("displays the logical event (suffix stripped) and session label, then deletes the marker", async () => {
    await writeFakeBin(
      "inotifywait",
      `#!/bin/bash
DIR="\${@: -1}"
uuid="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo fake-$$ )"
file="AGENT_DONE.$uuid"
printf '%s' 'inotify-test-session' > "$DIR/$file"
printf '%s\\n' "$file"
exit 0
`,
    );
    await writeFakeBin(
      "flock",
      `#!/bin/bash
exit 0
`,
    );
    const env = watcherEnv({ withSystemBin: false });
    const child = spawnWatcher(env);
    const code = await waitForExit(child, 8000);
    assert.equal(code, 0);
    const records = await readNotifyRecord();
    assert.equal(records.length, 1);
    assert.equal(records[0].title, "Pi event handler");
    assert.match(records[0].body, /Event: AGENT_DONE\b/);
    assert.ok(
      !/AGENT_DONE\.[0-9a-f-]{36}/.test(records[0].body),
      "suffix must not appear in event",
    );
    assert.match(records[0].body, /Session: inotify-test-session/);
    const remaining = await readdir(markerDir);
    assert.ok(
      !remaining.some((f) => f.startsWith("AGENT_DONE.")),
      "marker must be deleted after notification",
    );
  });

  it("startup cleanup removes existing markers but preserves dotfiles", async () => {
    await writeFile(join(markerDir, "AGENT_DONE.preexisting"), "old");
    await writeFile(join(markerDir, ".keep"), "keepme");
    await writeFakeBin(
      "inotifywait",
      `#!/bin/bash
sleep 6
exit 0
`,
    );
    await writeFakeBin(
      "flock",
      `#!/bin/bash
exit 0
`,
    );
    const env = watcherEnv({ withSystemBin: false });
    const child = spawnWatcher(env);
    await waitForStdout(child, "Using inotifywait", 5000);
    await waitUntil(
      async () =>
        existsSync(join(markerDir, ".keep")) &&
        !existsSync(join(markerDir, "AGENT_DONE.preexisting")),
    );
    assert.ok(existsSync(join(markerDir, ".keep")));
    assert.ok(!existsSync(join(markerDir, "AGENT_DONE.preexisting")));
  });

  it("polling fallback consumes markers", async () => {
    // No inotifywait/flock in PATH (no system bins); fake notify-send is present.
    await writeFakeBin(
      "flock",
      `#!/bin/bash
exit 0
`,
    );
    const env = watcherEnv({ withSystemBin: false });
    const child = spawnWatcher(env);
    await waitForStdout(child, "using polling fallback", 5000);
    const uuid = randomUUID();
    const file = `AGENT_DONE.${uuid}`;
    await writeFile(join(markerDir, file), "poll-session");
    await waitUntil(async () => (await readNotifyRecord()).length >= 1, 10000);
    const records = await readNotifyRecord();
    assert.equal(records.length, 1);
    assert.equal(records[0].title, "Pi event handler");
    assert.match(records[0].body, /Event: AGENT_DONE\b/);
    assert.match(records[0].body, /Session: poll-session/);
    const remaining = await readdir(markerDir);
    assert.ok(
      !remaining.some((f) => f.startsWith("AGENT_DONE.")),
      "marker must be deleted after notification",
    );
  });

  it("a second watcher exits non-zero while the first holds the flock", async () => {
    // Use real flock via system PATH. Fake notify-send + sleeping inotifywait.
    await writeFakeBin(
      "inotifywait",
      `#!/bin/bash
sleep 8
exit 0
`,
    );
    const env = watcherEnv({ withSystemBin: true });
    const first = spawnWatcher(env);
    await waitForStdout(first, "Using inotifywait", 5000);
    const second = spawnWatcher(env);
    const code = await waitForExit(second, 6000);
    assert.notEqual(
      code,
      0,
      "second watcher should exit non-zero when the lock is held",
    );
    const firstCode = await waitForExit(first, 9000);
    assert.equal(firstCode, 0);
  });

  it("ignores dotfiles in the polling path", async () => {
    await writeFakeBin(
      "flock",
      `#!/bin/bash
exit 0
`,
    );
    const env = watcherEnv({ withSystemBin: false });
    const child = spawnWatcher(env);
    await waitForStdout(child, "using polling fallback", 5000);
    await writeFile(join(markerDir, ".dotmarker"), "should-not-notify");
    await new Promise((r) => setTimeout(r, 800));
    const records = await readNotifyRecord();
    assert.equal(records.length, 0, "dotfiles must not be consumed");
    assert.ok(existsSync(join(markerDir, ".dotmarker")));
  });
});
