# Handoff: T3r “Update from upstream” button

## Context

Soft-fork of T3 Code at `~/code/t3code`

- **Remote `origin`:** `https://github.com/rscottseattle/t3code`
- **Remote `upstream`:** `https://github.com/pingdotgg/t3code`
- **Branch (when this was written):** `feature/glass-aurora-skin`
- **Latest related push:** `bb50a2788` — branding T3r, usage rings, file-tree menus, etc.

User wants a **manual** update path (no stock auto-update). They were fine with a terminal one-liner; then asked for an **in-app button** that does the same work.

---

## What already exists (done)

| Area                                         | Status                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| App name **T3r**, custom icon, sidebar brand | Done                                                                             |
| Usage rings above Settings                   | Done                                                                             |
| Files browser right-click ≈ chat path chips  | Done                                                                             |
| Neon green Done + electric purple Working    | Done                                                                             |
| Install story                                | Build DMG with `vp run dist:desktop:dmg:arm64` (or `:x64`), drag to Applications |
| Terminal update story (documented)           | `git fetch upstream && git merge upstream/main` then rebuild DMG                 |

**Not built:** the sidebar **Update** button / IPC / script that runs that pipeline from the UI.

---

## Feature to implement (user request)

**UI:** Button **directly above Settings** in the left sidebar footer (`SidebarChrome.tsx` → `SidebarChromeFooter`). Label like **“Update”** / **“Update from upstream”**.

**Behavior on click:**

1. Confirm (destructive / long-running).
2. In the **repo** (`~/code/t3code`, overridable via env e.g. `T3R_REPO`):
   - Fail if **dirty** working tree (uncommitted changes) — clear message: commit/stash first.
   - `git fetch upstream`
   - `git merge upstream/main` (fallback `upstream/master` if needed)
   - Use **merge**, not reset — keeps soft-fork commits; conflicts → abort merge, surface error (no silent override of their work).
3. Rebuild installable app (same as terminal): e.g. `vp run dist:desktop:dmg:arm64` (detect arch).
4. UX: progress / toasts (“merging…”, “building… can take several minutes”).
5. After success: they reinstall from DMG **or** copy `.app` into Applications; **must restart** the running app to run new code (`app.relaunch` + quit only works if new binary is already installed).

**Important:** Full DMG build can take many minutes; `ipcRenderer.invoke` may hang. Prefer either:

- **git-only** in the request + toast “merged, start rebuild”, or
- **spawn detached rebuild** with log file + notification when done,

not a single blocking invoke for the whole build.

---

## Suggested implementation sketch

1. **`scripts/t3r-self-update.mjs`**
   - Resolve repo root (`T3R_REPO` or repo relative to script).
   - Dirty check → exit non-zero JSON error.
   - `fetch` + `merge` upstream.
   - Optional `--rebuild` flag for DMG.
   - Print machine-readable result JSON on stdout/stderr.

2. **Desktop IPC** (mirror `showItemInFolder` / updates):
   - Channel e.g. `desktop:soft-fork-update`
   - `apps/desktop/src/ipc/methods/softForkUpdate.ts`
   - Register in `DesktopIpcHandlers.ts`
   - Expose on `preload.ts` as `runSoftForkUpdate?: () => Promise<Result>`
   - Optional on `DesktopBridge` in `packages/contracts/src/ipc.ts`

3. **Web UI**
   - `SidebarChromeFooter`: button above Settings, desktop-only (`window.desktopBridge?.runSoftForkUpdate`).
   - Loading state, toast success/failure (dirty / conflict / build fail).

4. **Do not** use stock `electron-updater` against `pingdotgg/t3code` — that would replace T3r with stock T3.

---

## Key files

| Purpose                   | Path                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Sidebar footer (Settings) | `apps/web/src/components/sidebar/SidebarChrome.tsx`                                        |
| IPC channels              | `apps/desktop/src/ipc/channels.ts`                                                         |
| IPC handlers install      | `apps/desktop/src/ipc/DesktopIpcHandlers.ts`                                               |
| Example IPC method        | `apps/desktop/src/ipc/methods/window.ts` (`showItemInFolder`)                              |
| Preload bridge            | `apps/desktop/src/preload.ts`                                                              |
| Bridge types              | `packages/contracts/src/ipc.ts` (`DesktopBridge`)                                          |
| Branding / product name   | `apps/desktop/src/app/DesktopEnvironment.ts`, `apps/desktop/scripts/electron-launcher.mjs` |
| Desktop package name      | `apps/desktop/package.json` → `"productName": "T3r"`                                       |

---

## Constraints / gotchas

- **Running app cannot fully self-replace** mid-flight; restart required after new binary is installed.
- **Merge conflicts** need human resolution — button should fail clearly, not force.
- **Uncommitted local work** should block update.
- Dev (`vp run dev:desktop`) vs installed DMG: same git step; rebuild/reinstall differs.
- App identity for fork: `com.t3tools.t3r` / userData `t3r-dev` — keep separate from stock T3.

---

## User intent (short)

Install real T3r app; when they notice upstream has new features, **click one button** that pulls **upstream into their branch without wiping their customizations**, then rebuild; they’re fine watching it and restarting. No need for a polished auto-updater product pipeline unless they ask later.

---

## Open choice for implementer

| Approach                                        | Pros                                   |
| ----------------------------------------------- | -------------------------------------- |
| **A. Git merge only + clear “rebuild” message** | Fast, reliable, hard to hang UI        |
| **B. Merge + detached rebuild + notification**  | Matches “do it all” better             |
| **C. Merge + blocking full build in IPC**       | Simple code, bad UX (timeouts/freezes) |

Recommend **B** (or **A** for first PR, then B).

---

## Not in scope for this button

- Stock T3 GitHub auto-update feed
- Resolving merge conflicts in-app
- Force-push / rewriting their soft-fork history

---

## Terminal update (until the button ships)

```bash
cd ~/code/t3code
git fetch upstream
git merge upstream/main   # or upstream/master
# if conflicts: fix, commit; if dirty before: commit or stash first
vp run dist:desktop:dmg:arm64   # or :x64 on Intel
# open DMG → replace app in Applications → restart
```
