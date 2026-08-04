# Skills Surface

## Outcome

T3r exposes the skills reported by every configured agent application in a searchable right-panel surface. Skills are grouped by what they help the user do, not by filesystem location or provider. Clicking or dragging a skill inserts `Use $skill-name` into the composer, where the existing `$skill-name` syntax renders as a linked skill chip.

## User experience

1. Open **Skills** from the right-panel surface menu.
2. Browse category-first groups or search by skill name, description, category, provider, scope, or source path.
3. Click a card to add it at the end of the current prompt, or drag it to an exact position in the composer.
4. See application badges on each card when the same skill is available from one or more agent providers.

The first catalog uses these stable work categories:

- Video
- Social Media
- Audio & Podcasts
- Images & Design
- Research & Strategy
- Development
- Writing & Content
- Business & Productivity
- Other

Category assignment is deterministic and keyword-based. This makes the initial system understandable, fast, and easy to tune without introducing a taxonomy service or changing individual skill files.

## Architecture

```text
Codex / Claude provider adapters
             |
             v
     ServerProvider.skills
             |
             v
 buildProviderSkillCatalog()
             |
             v
        SkillsPanel
       /           \
    click          drag
       \           /
        Use $skill-name
             |
             v
      existing composer chip
```

`providerSkillCatalog.ts` is the module boundary. It deduplicates skills by canonical name, preserves every provider installation and source path, assigns a work category, and supplies normalized search text. The panel only renders that catalog and emits insertion intent; it does not know how Codex, Claude, or future providers discover skills.

The first release deliberately consumes the provider snapshots T3r already has. That avoids a second filesystem scan, keeps remote environments working, and lets each provider remain authoritative for its own skill locations. Workspace-scoped discovery can be added later behind the same catalog interface when its upstream provider RPC is ready.

## Platform scope

The surface is available in the desktop and web right-panel layouts, including the narrow sheet layout. The catalog is read-only. No skill files, provider settings, or model selections are changed by browsing or inserting a skill.

## Integration and release sequence

1. Fast-forward the T3r branch to its latest origin commit.
2. Merge current `upstream/main`, preserving T3r's product identity and stable Electron data directories.
3. Add the normalized catalog, right-panel surface state, panel UI, and composer click/drag integration.
4. Bump the coordinated desktop, server, and web version to `0.0.39`.
5. Produce the macOS arm64 desktop artifact, install it over the closed app, and push the integrated branch.

## Follow-on decisions

The clean next extension is explicit metadata in each skill manifest, such as `category` and `tags`. The deterministic rules should remain the fallback so older and third-party skills still appear without migration work. Skill editing, installation, enable/disable controls, and marketplace browsing are separate workflows and are not part of this surface.
