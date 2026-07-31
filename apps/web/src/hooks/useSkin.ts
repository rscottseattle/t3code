import * as Schema from "effect/Schema";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Soft-fork appearance skins layered on light/dark.
 * Charcoal Soft is the default for night-friendly contrast.
 */
export const AppSkin = Schema.Literals([
  "default",
  "charcoal-soft",
  "charcoal-slate",
  "charcoal-graphite",
  "charcoal-frost",
  "charcoal-ember",
]);
export type AppSkin = typeof AppSkin.Type;

const STORAGE_KEY = "t3code:skin";
const DEFAULT_SKIN: AppSkin = "charcoal-soft";

const VALID_SKINS = new Set<string>(AppSkin.literals);

const SKIN_OPTIONS: ReadonlyArray<{ value: AppSkin; label: string; description: string }> = [
  {
    value: "charcoal-soft",
    label: "Charcoal Soft",
    description: "Neutral graphite, light text, quiet glass — default nighttime look.",
  },
  {
    value: "charcoal-slate",
    label: "Charcoal Slate",
    description: "Cool blue-slate charcoal with a slightly techier accent.",
  },
  {
    value: "charcoal-graphite",
    label: "Charcoal Graphite",
    description: "Flat monochrome graphite and crisp white text.",
  },
  {
    value: "charcoal-frost",
    label: "Charcoal Frost",
    description: "More frosted glass and translucent panels on deep charcoal.",
  },
  {
    value: "charcoal-ember",
    label: "Charcoal Ember",
    description: "Warm brown-charcoal, soft white text — evening lamp feel.",
  },
  {
    value: "default",
    label: "Stock Default",
    description: "Upstream T3 light/dark (pure black dark chrome).",
  },
];

export function listSkinOptions() {
  return SKIN_OPTIONS;
}

function isAppSkin(value: string | null | undefined): value is AppSkin {
  return typeof value === "string" && VALID_SKINS.has(value);
}

let listeners: Array<() => void> = [];
let cachedSkin: AppSkin | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

export function readSkinPreference(): AppSkin {
  if (typeof window === "undefined") return DEFAULT_SKIN;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isAppSkin(raw)) return raw;
  } catch {
    // fall through
  }
  return DEFAULT_SKIN;
}

export function writeSkinPreference(skin: AppSkin): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, skin);
  } catch {
    // ignore quota / private mode
  }
}

export function applySkin(skin: AppSkin): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.skin = skin;
  cachedSkin = skin;
}

function getSnapshot(): AppSkin {
  if (typeof window === "undefined") return DEFAULT_SKIN;
  if (cachedSkin !== null) return cachedSkin;
  cachedSkin = readSkinPreference();
  return cachedSkin;
}

function getServerSnapshot(): AppSkin {
  return DEFAULT_SKIN;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cachedSkin = null;
    const next = readSkinPreference();
    applySkin(next);
    emitChange();
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Apply stored skin once on app boot (before React paint when possible). */
export function bootstrapSkin(): void {
  applySkin(readSkinPreference());
}

export function useSkin() {
  const skin = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSkin = useCallback((next: AppSkin) => {
    writeSkinPreference(next);
    applySkin(next);
    emitChange();
  }, []);

  useEffect(() => {
    applySkin(skin);
  }, [skin]);

  return { skin, setSkin, options: SKIN_OPTIONS } as const;
}
