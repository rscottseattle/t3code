/**
 * T3r soft-fork updater: merge upstream T3 into the local checkout without
 * touching local commits, optionally rebuilding the DMG afterwards.
 *
 * Usage: node scripts/t3r-self-update.mjs [--repo <path>] [--rebuild] [--json]
 *
 * Result statuses: merged | up-to-date | dirty | conflict | error.
 * With --json exactly one JSON object is printed to stdout; the exit code is
 * 0 only for ok results. The desktop "Update from upstream" IPC method runs
 * this script with --json, so keep the output shape stable.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

function parseArgs(argv) {
  const args = { repo: null, rebuild: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") {
      args.repo = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--rebuild") {
      args.rebuild = true;
    } else if (arg === "--json") {
      args.json = true;
    }
  }
  return args;
}

async function git(repo, ...gitArgs) {
  const { stdout } = await execFileAsync("git", gitArgs, {
    cwd: repo,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

async function gitOk(repo, ...gitArgs) {
  try {
    await git(repo, ...gitArgs);
    return true;
  } catch {
    return false;
  }
}

async function runUpdate(repo) {
  if (!NodeFS.existsSync(NodePath.join(repo, ".git"))) {
    return { ok: false, status: "error", message: `Not a git repository: ${repo}` };
  }
  const remotes = (await git(repo, "remote")).split("\n");
  if (!remotes.includes("upstream")) {
    return {
      ok: false,
      status: "error",
      message: `No "upstream" remote in ${repo}. Add it with: git remote add upstream https://github.com/pingdotgg/t3code`,
    };
  }

  const dirty = await git(repo, "status", "--porcelain");
  if (dirty.length > 0) {
    return {
      ok: false,
      status: "dirty",
      message: "Uncommitted changes in the repo — commit or stash them first.",
    };
  }

  await git(repo, "fetch", "upstream");

  const upstreamBranch = (await gitOk(repo, "rev-parse", "--verify", "upstream/main"))
    ? "upstream/main"
    : "upstream/master";
  if (!(await gitOk(repo, "rev-parse", "--verify", upstreamBranch))) {
    return {
      ok: false,
      status: "error",
      message: "Neither upstream/main nor upstream/master exists.",
    };
  }

  const incoming = Number(await git(repo, "rev-list", "--count", `HEAD..${upstreamBranch}`));
  if (incoming === 0) {
    return {
      ok: true,
      status: "up-to-date",
      message: "Already up to date with upstream.",
      upstreamBranch,
    };
  }

  try {
    await git(repo, "merge", "--no-edit", upstreamBranch);
  } catch (error) {
    let conflictFiles = [];
    try {
      const conflicted = await git(repo, "diff", "--name-only", "--diff-filter=U");
      conflictFiles = conflicted.length > 0 ? conflicted.split("\n") : [];
    } catch {
      // Best effort; the abort below matters more than the file list.
    }
    try {
      await git(repo, "merge", "--abort");
    } catch {
      // Already aborted (or the merge never started); either way the tree is intact.
    }
    return {
      ok: false,
      status: "conflict",
      message: `Merge conflict with ${upstreamBranch} — resolve it in a terminal. The merge was aborted; nothing changed.`,
      conflictFiles,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ok: true,
    status: "merged",
    message: `Merged ${incoming} upstream commit${incoming === 1 ? "" : "s"} from ${upstreamBranch}.`,
    mergedCommits: incoming,
    upstreamBranch,
  };
}

function rebuildInline(repo) {
  // No --arch: build-desktop-artifact.ts defaults to the host architecture.
  return new Promise((resolvePromise) => {
    const child = NodeChildProcess.spawn(
      "node",
      ["scripts/build-desktop-artifact.ts", "--platform", "mac", "--target", "dmg"],
      { cwd: repo, stdio: "inherit" },
    );
    child.on("exit", (code) => resolvePromise(code === 0));
    child.on("error", () => resolvePromise(false));
  });
}

const args = parseArgs(process.argv.slice(2));
const scriptDir = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const repo = NodePath.resolve(args.repo ?? process.env.T3R_REPO ?? NodePath.join(scriptDir, ".."));

let result;
try {
  result = await runUpdate(repo);
} catch (error) {
  result = {
    ok: false,
    status: "error",
    message: error instanceof Error ? error.message : String(error),
  };
}

if (result.ok && result.status === "merged" && args.rebuild) {
  if (args.json) {
    result.buildOk = await rebuildInline(repo);
  } else {
    console.log(result.message);
    console.log("Rebuilding DMG…");
    result.buildOk = await rebuildInline(repo);
    console.log(result.buildOk ? "Build finished." : "Build failed.");
  }
}

if (args.json) {
  console.log(JSON.stringify(result));
} else if (!(result.status === "merged" && args.rebuild)) {
  console.log(result.message);
  if (result.conflictFiles?.length) {
    console.log(`Conflicted files:\n  ${result.conflictFiles.join("\n  ")}`);
  }
}

process.exit(result.ok && result.buildOk !== false ? 0 : 1);
