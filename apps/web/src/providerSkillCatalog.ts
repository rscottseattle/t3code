import type { ServerProvider, ServerProviderSkill } from "@t3tools/contracts";

import { formatProviderSkillDisplayName } from "./providerSkillPresentation";

export const SKILL_CATEGORIES = [
  { id: "video", label: "Video" },
  { id: "social-media", label: "Social Media" },
  { id: "audio-podcasts", label: "Audio & Podcasts" },
  { id: "images-design", label: "Images & Design" },
  { id: "research-strategy", label: "Research & Strategy" },
  { id: "development", label: "Development" },
  { id: "writing-content", label: "Writing & Content" },
  { id: "business-productivity", label: "Business & Productivity" },
  { id: "other", label: "Other" },
] as const;

export type SkillCategoryId = (typeof SKILL_CATEGORIES)[number]["id"];

export interface SkillCatalogInstallation {
  providerInstanceId: ServerProvider["instanceId"];
  providerDriver: ServerProvider["driver"];
  providerLabel: string;
  path: string;
  scope: string | null;
  enabled: boolean;
}

export interface SkillCatalogEntry {
  id: string;
  name: string;
  label: string;
  description: string | null;
  category: SkillCategoryId;
  enabled: boolean;
  installations: ReadonlyArray<SkillCatalogInstallation>;
  searchText: string;
}

interface MutableSkillCatalogEntry extends Omit<SkillCatalogEntry, "installations"> {
  installations: SkillCatalogInstallation[];
}

const CATEGORY_RULES: ReadonlyArray<{
  category: Exclude<SkillCategoryId, "other">;
  terms: ReadonlyArray<string>;
}> = [
  {
    category: "video",
    terms: [
      "video",
      "youtube",
      "short-form",
      "shorts",
      "reels",
      "sermon-package",
      "speech-video",
      "lower-third",
      "higgsfield",
      "remotion",
      "heygen",
      "hyperframes",
      "video-clip",
      "sermon-clips",
    ],
  },
  {
    category: "social-media",
    terms: [
      "social-media",
      "social media",
      "facebook",
      "instagram",
      "linkedin",
      "reddit",
      "meta-operations",
      "brand-content",
      "content-engine",
      "page-post",
    ],
  },
  {
    category: "audio-podcasts",
    terms: ["podcast", "audio", "voiceover", "voice-over", "elevenlabs", "text-to-speech", "tts"],
  },
  {
    category: "images-design",
    terms: [
      "imagegen",
      "image-gen",
      "image generation",
      "creative-production",
      "product-design",
      "canva",
      "figma",
      "visualize",
      "thumbnail",
      "whiteboard",
      "presentation",
      "slides",
    ],
  },
  {
    category: "research-strategy",
    terms: [
      "research",
      "aeo-",
      "answer-stack",
      "dossier",
      "topic-landscape",
      "publishing-map",
      "semrush",
      "zotero",
      "analytics",
      "competitor",
      "competitive",
      "strategy",
    ],
  },
  {
    category: "development",
    terms: [
      "code-review",
      "codebase",
      "github",
      "git-",
      "merge-conflict",
      "debug",
      "diagnosing-bugs",
      "tdd",
      "test-driven",
      "web-app",
      "ios-app",
      "macos-app",
      "nextjs",
      "react",
      "vercel",
      "supabase",
      "postgres",
      "database",
      "cloudflare",
      "sentry",
      "posthog",
      "replit",
      "lovable",
      "security",
      "plugin-creator",
      "skill-creator",
      "skill-installer",
      "api",
      "hosting",
    ],
  },
  {
    category: "writing-content",
    terms: [
      "writing",
      "copy",
      "document",
      "google-docs",
      "description",
      "transcript",
      "quiz",
      "article",
      "blog",
      "content",
      "template-creator",
      "pdf",
    ],
  },
  {
    category: "business-productivity",
    terms: [
      "notion",
      "google-drive",
      "google-sheets",
      "spreadsheet",
      "excel",
      "calendar",
      "gmail",
      "outlook",
      "email",
      "slack",
      "teams",
      "airtable",
      "asana",
      "monday",
      "planning-center",
      "workflow",
      "crm",
      "hubspot",
      "apollo",
      "sales",
      "stripe",
      "granola",
      "sharepoint",
      "box",
      "productivity",
      "marketing",
    ],
  },
];

const CATEGORY_ORDER = new Map(
  SKILL_CATEGORIES.map((category, index) => [category.id, index] as const),
);

function titleCaseWords(value: string): string {
  return value
    .split(/[\s:_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function providerLabel(provider: ServerProvider): string {
  return provider.displayName?.trim() || titleCaseWords(provider.driver);
}

function skillDescription(skill: ServerProviderSkill): string | null {
  return skill.shortDescription?.trim() || skill.description?.trim() || null;
}

export function categorizeProviderSkill(skill: ServerProviderSkill): SkillCategoryId {
  const haystack = [
    skill.name,
    skill.displayName,
    skill.shortDescription,
    skill.description,
    skill.path.replaceAll("\\", "/"),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.terms.some((term) => haystack.includes(term))) {
      return rule.category;
    }
  }
  return "other";
}

function catalogSearchText(entry: MutableSkillCatalogEntry): string {
  return [
    entry.name,
    entry.label,
    entry.description,
    SKILL_CATEGORIES.find((category) => category.id === entry.category)?.label,
    ...entry.installations.flatMap((installation) => [
      installation.providerLabel,
      installation.providerDriver,
      installation.scope,
      installation.path,
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

/**
 * Normalize provider-shaped skill snapshots into one catalog. Provider and
 * filesystem differences stay behind this interface; the Skills surface only
 * needs categories, labels, and the installations that can invoke each skill.
 */
export function buildProviderSkillCatalog(
  providers: ReadonlyArray<ServerProvider>,
): SkillCatalogEntry[] {
  const entries = new Map<string, MutableSkillCatalogEntry>();

  for (const provider of providers) {
    for (const skill of provider.skills) {
      const name = skill.name.trim();
      if (!name) continue;

      const id = name.toLowerCase();
      const enabled = provider.enabled && provider.installed && skill.enabled;
      const installation: SkillCatalogInstallation = {
        providerInstanceId: provider.instanceId,
        providerDriver: provider.driver,
        providerLabel: providerLabel(provider),
        path: skill.path,
        scope: skill.scope?.trim() || null,
        enabled,
      };
      const existing = entries.get(id);

      if (!existing) {
        const entry: MutableSkillCatalogEntry = {
          id,
          name,
          label: formatProviderSkillDisplayName(skill),
          description: skillDescription(skill),
          category: categorizeProviderSkill(skill),
          enabled,
          installations: [installation],
          searchText: "",
        };
        entry.searchText = catalogSearchText(entry);
        entries.set(id, entry);
        continue;
      }

      if (
        !existing.installations.some(
          (candidate) =>
            candidate.providerInstanceId === installation.providerInstanceId &&
            candidate.path === installation.path,
        )
      ) {
        existing.installations.push(installation);
      }
      existing.enabled ||= enabled;
      existing.description ||= skillDescription(skill);
      if (existing.category === "other") {
        existing.category = categorizeProviderSkill(skill);
      }
      existing.searchText = catalogSearchText(existing);
    }
  }

  return [...entries.values()].sort((left, right) => {
    const categoryDifference =
      (CATEGORY_ORDER.get(left.category) ?? Number.MAX_SAFE_INTEGER) -
      (CATEGORY_ORDER.get(right.category) ?? Number.MAX_SAFE_INTEGER);
    return categoryDifference || left.label.localeCompare(right.label);
  });
}

export function filterSkillCatalog(
  entries: ReadonlyArray<SkillCatalogEntry>,
  query: string,
): SkillCatalogEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...entries];
  return entries.filter((entry) => terms.every((term) => entry.searchText.includes(term)));
}

export function formatSkillComposerInsertion(skill: Pick<SkillCatalogEntry, "name">): string {
  return `Use $${skill.name}`;
}
