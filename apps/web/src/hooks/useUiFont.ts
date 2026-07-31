import * as Schema from "effect/Schema";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Soft-fork UI font preference (sans only — mono stays JetBrains / SF Mono).
 * Default is system (Paseo-like native stack).
 */
const UI_FONT_VALUES = ["system", "geist", "inter", "dm-sans"] as const;

export const UiFont = Schema.Literals(UI_FONT_VALUES);
export type UiFont = (typeof UI_FONT_VALUES)[number];

const STORAGE_KEY = "t3code:ui-font";
const DEFAULT_UI_FONT: UiFont = "system";
const VALID = new Set<string>(UI_FONT_VALUES);

const UI_FONT_OPTIONS: ReadonlyArray<{
  value: UiFont;
  label: string;
  description: string;
}> = [
  {
    value: "system",
    label: "System",
    description: "Native OS UI font (San Francisco on Mac) — cleanest for long sessions.",
  },
  {
    value: "geist",
    label: "Geist",
    description: "Vercel’s product face — modern, sharp, “cutting-edge tech.”",
  },
  {
    value: "inter",
    label: "Inter",
    description: "Widely used UI sans — neutral, highly legible at small sizes.",
  },
  {
    value: "dm-sans",
    label: "DM Sans",
    description: "Stock T3 Code UI font.",
  },
];

export function listUiFontOptions() {
  return UI_FONT_OPTIONS;
}

function isUiFont(value: string | null | undefined): value is UiFont {
  return typeof value === "string" && VALID.has(value);
}

let listeners: Array<() => void> = [];
let cached: UiFont | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

export function readUiFontPreference(): UiFont {
  if (typeof window === "undefined") return DEFAULT_UI_FONT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isUiFont(raw)) return raw;
  } catch {
    // fall through
  }
  return DEFAULT_UI_FONT;
}

export function writeUiFontPreference(font: UiFont): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, font);
  } catch {
    // ignore
  }
}

export function applyUiFont(font: UiFont): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiFont = font;
  cached = font;
}

function getSnapshot(): UiFont {
  if (typeof window === "undefined") return DEFAULT_UI_FONT;
  if (cached !== null) return cached;
  cached = readUiFontPreference();
  return cached;
}

function getServerSnapshot(): UiFont {
  return DEFAULT_UI_FONT;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cached = null;
    applyUiFont(readUiFontPreference());
    emitChange();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function bootstrapUiFont(): void {
  applyUiFont(readUiFontPreference());
}

export function useUiFont() {
  const uiFont = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setUiFont = useCallback((next: UiFont) => {
    writeUiFontPreference(next);
    applyUiFont(next);
    emitChange();
  }, []);

  useEffect(() => {
    applyUiFont(uiFont);
  }, [uiFont]);

  return { uiFont, setUiFont, options: UI_FONT_OPTIONS } as const;
}
