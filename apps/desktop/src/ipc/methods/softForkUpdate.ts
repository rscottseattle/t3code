// @effect-diagnostics nodeBuiltinImport:off - drives git + the DMG build at the OS boundary.
// @effect-diagnostics globalDate:off - log filename timestamp for a fire-and-forget build process.
/**
 * Soft-fork: "Update from upstream" pipeline. Runs the repo's
 * `scripts/t3r-self-update.mjs` (dirty check → fetch upstream → merge) in a
 * child process, then optionally spawns the DMG rebuild with output piped to
 * a log file and a native notification on completion. The merge phase is
 * fast and awaited; the rebuild takes minutes and is intentionally not
 * awaited so the ipcRenderer.invoke never hangs.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  SoftForkUpdateInputSchema,
  SoftForkUpdateResultSchema,
  type SoftForkUpdateResult,
  type SoftForkUpdateStatus,
} from "@t3tools/contracts";
import { HostProcessArchitecture } from "@t3tools/shared/hostProcess";
import { Notification } from "electron";
import * as Effect from "effect/Effect";

import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

const SCRIPT_TIMEOUT_MS = 120_000;

const RESULT_STATUSES: readonly SoftForkUpdateStatus[] = [
  "merged",
  "up-to-date",
  "dirty",
  "conflict",
  "error",
];

function resolveRepoRoot(): string {
  const configured = process.env.T3R_REPO;
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }
  return NodePath.join(NodeOS.homedir(), "code", "t3code");
}

function parseScriptResult(stdout: string, stderr: string): SoftForkUpdateResult {
  const line = stdout.trim().split("\n").at(-1) ?? "";
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const status = RESULT_STATUSES.find((candidate) => candidate === parsed.status) ?? "error";
    return {
      status,
      message:
        typeof parsed.message === "string" && parsed.message.length > 0
          ? parsed.message
          : "Self-update script returned no message.",
      ...(typeof parsed.mergedCommits === "number" ? { mergedCommits: parsed.mergedCommits } : {}),
      ...(Array.isArray(parsed.conflictFiles) &&
      parsed.conflictFiles.every((file): file is string => typeof file === "string")
        ? { conflictFiles: parsed.conflictFiles }
        : {}),
    };
  } catch {
    return {
      status: "error",
      message: stderr.trim() || "Self-update script produced no parsable output.",
    };
  }
}

function runUpdateScript(scriptPath: string, repoRoot: string): Promise<SoftForkUpdateResult> {
  return new Promise((resolvePromise) => {
    // process.execPath is the Electron binary; ELECTRON_RUN_AS_NODE turns it
    // into a plain Node runtime so this works in dev and packaged builds
    // without assuming `node` is on the app's PATH.
    const child = NodeChildProcess.spawn(
      process.execPath,
      [scriptPath, "--repo", repoRoot, "--json"],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: SCRIPT_TIMEOUT_MS,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolvePromise({ status: "error", message: error.message });
    });
    child.on("close", () => {
      resolvePromise(parseScriptResult(stdout, stderr));
    });
  });
}

function spawnRebuild(repoRoot: string, hostArch: string): string {
  const arch = hostArch === "arm64" ? "arm64" : "x64";
  const logPath = NodePath.join(NodeOS.tmpdir(), `t3r-rebuild-${Date.now()}.log`);
  const log = NodeFS.createWriteStream(logPath);
  // Login shell so the user's PATH (vp, node) resolves the same way it does
  // in their terminal. Not detached on purpose: the exit event drives the
  // completion notification, and a rebuild has no value after the app quits.
  const child = NodeChildProcess.spawn(
    "/bin/zsh",
    ["-lc", `cd ${JSON.stringify(repoRoot)} && exec vp run dist:desktop:dmg:${arch}`],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const notify = (body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title: "T3r update", body }).show();
    }
  };
  child.on("error", () => {
    notify(`DMG build failed to start — check the log: ${logPath}`);
  });
  child.on("exit", (code) => {
    notify(
      code === 0
        ? "DMG build finished — open the DMG, replace T3r in Applications, then restart the app."
        : `DMG build failed — check the log: ${logPath}`,
    );
  });
  return logPath;
}

export const runSoftForkUpdate = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SOFT_FORK_UPDATE_CHANNEL,
  payload: SoftForkUpdateInputSchema,
  result: SoftForkUpdateResultSchema,
  handler: Effect.fn("desktop.ipc.softForkUpdate.run")(function* (input) {
    const repoRoot = resolveRepoRoot();
    const scriptPath = NodePath.join(repoRoot, "scripts", "t3r-self-update.mjs");
    if (!NodeFS.existsSync(scriptPath)) {
      return {
        status: "error",
        message: `T3r repo not found at ${repoRoot} (set T3R_REPO to override).`,
      } satisfies SoftForkUpdateResult;
    }
    const result = yield* Effect.promise(() => runUpdateScript(scriptPath, repoRoot));
    if (result.status !== "merged" || !input.rebuild) {
      return result;
    }
    const hostArch = yield* HostProcessArchitecture;
    const logPath = yield* Effect.sync(() => spawnRebuild(repoRoot, hostArch));
    return { ...result, buildStarted: true, buildLogPath: logPath };
  }),
});
