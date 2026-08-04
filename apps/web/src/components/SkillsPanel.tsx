import type { ServerProvider } from "@t3tools/contracts";
import { ChevronRight, GripVertical, Search, Sparkles } from "lucide-react";
import { memo, type DragEvent, useCallback, useDeferredValue, useMemo, useState } from "react";

import { COMPOSER_MENTION_DRAG_TYPE } from "~/components/chat/composerMentionDrag";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  buildProviderSkillCatalog,
  filterSkillCatalog,
  formatSkillComposerInsertion,
  SKILL_CATEGORIES,
  type SkillCategoryId,
  type SkillCatalogEntry,
} from "~/providerSkillCatalog";
import { cn } from "~/lib/utils";

interface SkillsPanelProps {
  providers: ReadonlyArray<ServerProvider>;
  onInsertSkill: (skill: SkillCatalogEntry) => void;
}

function skillProviderLabels(skill: SkillCatalogEntry): string[] {
  return [...new Set(skill.installations.map((installation) => installation.providerLabel))];
}

function skillSourceTitle(skill: SkillCatalogEntry): string {
  return skill.installations
    .map((installation) => `${installation.providerLabel}: ${installation.path}`)
    .join("\n");
}

const SkillCard = memo(function SkillCard(props: {
  skill: SkillCatalogEntry;
  onInsertSkill: (skill: SkillCatalogEntry) => void;
}) {
  const providerLabels = skillProviderLabels(props.skill);
  const insertion = formatSkillComposerInsertion(props.skill);

  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!props.skill.enabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData(COMPOSER_MENTION_DRAG_TYPE, insertion);
    event.dataTransfer.setData("text/plain", insertion);
  };

  return (
    <button
      type="button"
      draggable={props.skill.enabled}
      disabled={!props.skill.enabled}
      title={skillSourceTitle(props.skill)}
      onClick={() => props.onInsertSkill(props.skill)}
      onDragStart={onDragStart}
      className={cn(
        "group/skill flex w-full items-start gap-2.5 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition",
        props.skill.enabled
          ? "cursor-grab hover:border-border hover:bg-accent/55 active:cursor-grabbing"
          : "cursor-not-allowed opacity-50",
      )}
    >
      <Sparkles className="mt-0.5 size-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{props.skill.label}</span>
          <code className="hidden truncate text-[10px] text-muted-foreground min-[420px]:inline">
            ${props.skill.name}
          </code>
        </span>
        {props.skill.description ? (
          <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
            {props.skill.description}
          </span>
        ) : null}
        <span className="mt-2 flex flex-wrap items-center gap-1">
          {providerLabels.slice(0, 2).map((label) => (
            <Badge key={label} size="sm" variant="outline">
              {label}
            </Badge>
          ))}
          {providerLabels.length > 2 ? (
            <Badge size="sm" variant="secondary">
              +{providerLabels.length - 2}
            </Badge>
          ) : null}
          {!props.skill.enabled ? (
            <Badge size="sm" variant="warning">
              Unavailable
            </Badge>
          ) : null}
        </span>
      </span>
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/45 opacity-0 transition-opacity group-hover/skill:opacity-100" />
    </button>
  );
});

export function SkillsPanel(props: SkillsPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<SkillCategoryId>>(
    () => new Set(),
  );
  const deferredQuery = useDeferredValue(query);
  const catalog = useMemo(() => buildProviderSkillCatalog(props.providers), [props.providers]);
  const categoryTotals = useMemo(() => {
    const counts = new Map<SkillCategoryId, number>(
      SKILL_CATEGORIES.map((category) => [category.id, 0] as const),
    );
    for (const skill of catalog) {
      counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
    }
    return SKILL_CATEGORIES.map((category) => ({
      ...category,
      count: counts.get(category.id) ?? 0,
    }));
  }, [catalog]);
  const filteredCatalog = useMemo(
    () => filterSkillCatalog(catalog, deferredQuery),
    [catalog, deferredQuery],
  );
  const groups = useMemo(() => {
    const entriesByCategory = new Map(
      SKILL_CATEGORIES.map((category) => [category.id, [] as SkillCatalogEntry[]] as const),
    );
    for (const skill of filteredCatalog) {
      entriesByCategory.get(skill.category)?.push(skill);
    }
    return SKILL_CATEGORIES.flatMap((category) => {
      const skills = entriesByCategory.get(category.id) ?? [];
      return skills.length > 0 ? [{ ...category, skills }] : [];
    });
  }, [filteredCatalog]);
  const toggleCategory = useCallback((categoryId: SkillCategoryId) => {
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Skills</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Click or drag a skill into the chat to use it.
            </p>
          </div>
          <Badge variant="secondary">{catalog.length}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Skill totals by category">
          {categoryTotals.map((category) => (
            <span
              key={category.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/35 px-2 py-1 text-[11px] text-muted-foreground"
            >
              <span>{category.label}</span>
              <span className="font-semibold tabular-nums text-foreground">{category.count}</span>
            </span>
          ))}
        </div>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            nativeInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search skills, categories, or applications"
            aria-label="Search skills"
            className="[&_input]:pl-8"
          />
        </label>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {groups.length > 0 ? (
          <div className="space-y-2 p-4">
            {groups.map((group) => {
              const expanded = expandedCategoryIds.has(group.id);
              const contentId = `skill-category-content-${group.id}`;
              return (
                <section key={group.id} aria-labelledby={`skill-category-${group.id}`}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={contentId}
                      onClick={() => toggleCategory(group.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition hover:border-border hover:bg-accent/55"
                    >
                      <ChevronRight
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          expanded && "rotate-90",
                        )}
                      />
                      <span
                        id={`skill-category-${group.id}`}
                        className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-foreground uppercase"
                      >
                        {group.label}
                      </span>
                      <Badge size="sm" variant="secondary">
                        {group.skills.length}
                      </Badge>
                    </button>
                  </h3>
                  {expanded ? (
                    <div id={contentId} className="mt-2 space-y-2">
                      {group.skills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          onInsertSkill={props.onInsertSkill}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center px-8 text-center">
            <Sparkles className="size-6 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {catalog.length === 0 ? "No skills discovered" : "No matching skills"}
            </p>
            <p className="mt-1 max-w-72 text-xs leading-relaxed text-muted-foreground">
              {catalog.length === 0
                ? "T3r will show skills reported by your connected agent applications here."
                : "Try a skill name, work category, or application name."}
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
