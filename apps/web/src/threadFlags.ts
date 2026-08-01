/**
 * Personal thread flags for the inbox sidebar.
 * Client-only priority marks (not lifecycle) — red / orange / yellow / green / blue / purple.
 */

export const THREAD_FLAG_COLORS = ["red", "orange", "yellow", "green", "blue", "purple"] as const;

export type ThreadFlagColor = (typeof THREAD_FLAG_COLORS)[number];

export const THREAD_FLAG_LABELS: Record<ThreadFlagColor, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
};

/** Filled flag glyph next to the project name. */
export const THREAD_FLAG_ICON_CLASS: Record<ThreadFlagColor, string> = {
  red: "text-red-500 dark:text-red-400",
  orange: "text-orange-500 dark:text-orange-400",
  yellow: "text-yellow-500 dark:text-yellow-400",
  green: "text-emerald-500 dark:text-emerald-400",
  blue: "text-sky-500 dark:text-sky-400",
  purple: "text-violet-500 dark:text-violet-400",
};

/**
 * Soft left→right wash over the row surface. Low opacity so Working/Done and
 * selection still read clearly; dark mode slightly stronger for contrast.
 */
export const THREAD_FLAG_GRADIENT_CLASS: Record<ThreadFlagColor, string> = {
  red: "bg-gradient-to-r from-red-500/14 via-red-500/6 to-transparent dark:from-red-500/18 dark:via-red-500/7",
  orange:
    "bg-gradient-to-r from-orange-500/14 via-orange-500/6 to-transparent dark:from-orange-500/18 dark:via-orange-500/7",
  yellow:
    "bg-gradient-to-r from-yellow-500/14 via-yellow-500/6 to-transparent dark:from-yellow-500/16 dark:via-yellow-500/6",
  green:
    "bg-gradient-to-r from-emerald-500/14 via-emerald-500/6 to-transparent dark:from-emerald-500/18 dark:via-emerald-500/7",
  blue: "bg-gradient-to-r from-sky-500/14 via-sky-500/6 to-transparent dark:from-sky-500/18 dark:via-sky-500/7",
  purple:
    "bg-gradient-to-r from-violet-500/14 via-violet-500/6 to-transparent dark:from-violet-500/18 dark:via-violet-500/7",
};

const THREAD_FLAG_COLOR_SET = new Set<string>(THREAD_FLAG_COLORS);

export function isThreadFlagColor(value: unknown): value is ThreadFlagColor {
  return typeof value === "string" && THREAD_FLAG_COLOR_SET.has(value);
}

export function sanitizeThreadFlagRecord(value: unknown): Record<string, ThreadFlagColor> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const next: Record<string, ThreadFlagColor> = {};
  for (const [threadId, flag] of Object.entries(value)) {
    if (threadId.length > 0 && isThreadFlagColor(flag)) {
      next[threadId] = flag;
    }
  }
  return next;
}

/** Context-menu / bulk menu entries for setting or clearing a flag. */
export function buildThreadFlagContextMenuItems(
  currentFlag: ThreadFlagColor | null,
  options?: { alwaysShowClear?: boolean },
): {
  id: string;
  label: string;
  children: readonly { id: string; label: string }[];
} {
  const children = THREAD_FLAG_COLORS.map((color) => ({
    id: `flag:${color}`,
    label: currentFlag === color ? `✓ ${THREAD_FLAG_LABELS[color]}` : THREAD_FLAG_LABELS[color],
  }));
  if (currentFlag !== null || options?.alwaysShowClear) {
    children.push({ id: "flag:clear", label: "Clear flag" });
  }
  return {
    id: "flag",
    label: "Flag",
    children,
  };
}

export function parseThreadFlagMenuId(
  value: string | null | undefined,
): ThreadFlagColor | null | undefined {
  if (value == null || !value.startsWith("flag:")) {
    return undefined;
  }
  if (value === "flag:clear") {
    return null;
  }
  const color = value.slice("flag:".length);
  return isThreadFlagColor(color) ? color : undefined;
}
