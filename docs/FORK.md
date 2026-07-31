# Soft fork notes (rscottseattle/t3code)

This repo is a **soft fork** of [pingdotgg/t3code](https://github.com/pingdotgg/t3code).

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `https://github.com/rscottseattle/t3code.git` | Our fork — push custom work here |
| `upstream` | `https://github.com/pingdotgg/t3code.git` | Official T3 Code — pull updates from here |

## Goals

1. Keep receiving upstream fixes and features.
2. Layer our own UI / UX changes on top (starting with better file-path open links).
3. Avoid rewriting core orchestration so merges stay cheap.

## Branch model

| Branch | Role |
|--------|------|
| `main` | Our stable customized line (starts equal to upstream `main`) |
| `feature/*` | Individual customizations |
| `sync/YYYY-MM-DD` | Temporary branch used while merging upstream |

Never edit upstream-only behavior without a note in this file.

## First-time setup

```bash
cd ~/code/t3code

# Install Vite+ (required by this monorepo)
curl -fsSL https://vite.plus | bash   # macOS/Linux

# Install deps
vp i

# Dev (web + server)
vp run dev
# or desktop:
# vp run dev:desktop
```

Needs Node 22.16+ (or 23.11+ / 24.10+). Authenticate at least one agent CLI (Claude / Codex / etc.) the same way stock T3 Code does.

## Day-to-day workflow

### Start a customization

```bash
git checkout main
git pull origin main
git checkout -b feature/file-path-links

# edit files…
git add -A
git commit -m "feat: …"
git push -u origin feature/file-path-links
```

Merge into `main` via GitHub PR on **your** fork (or merge locally).

### Pull upstream updates (do this weekly)

```bash
git fetch upstream
git checkout main
git checkout -b sync/$(date +%Y-%m-%d)
git merge upstream/main
# resolve conflicts, smoke-test
git checkout main
git merge sync/$(date +%Y-%m-%d)
git push origin main
```

Prefer **merge** over rebase for long-lived soft forks.

## Where to change UI

| Area | Path |
|------|------|
| Chat markdown / file chips | `apps/web/src/components/ChatMarkdown.tsx` |
| Path → link detection | `apps/web/src/markdown-links.ts` (+ tests) |
| Chat layout / timeline | `apps/web/src/components/chat/` |
| Shared client state | `packages/client-runtime/` |
| Desktop shell | `apps/desktop/` |
| Mobile | `apps/mobile/` |

**Rule:** prefer small patches in the files above. Put fork-only notes and intentional divergences in this document.

## Intentional divergences

_None yet — stock upstream `main` as of fork day._

| Date | Change | Files |
|------|--------|-------|
| — | — | — |

## Do not

- Mass-reformat upstream code
- Rename packages for branding (hurts merges)
- Run our fork and stock T3 with many agents at once unless comparing
