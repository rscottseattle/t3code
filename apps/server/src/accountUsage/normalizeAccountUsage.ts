import type {
  AccountUsageProviderSnapshot,
  AccountUsageWindow,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { ProviderInstanceId as ProviderInstanceIdBrand } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

const WINDOW_LABELS: Record<string, string> = {
  five_hour: "5 hour",
  seven_day: "7 day",
  seven_day_opus: "Opus",
  seven_day_sonnet: "Sonnet",
  seven_day_oauth_apps: "OAuth apps",
  overage: "Overage",
  extra_usage: "Extra usage",
  primary: "Primary",
  secondary: "Weekly",
  individual: "Individual",
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toIsoResetsAt(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Codex uses unix seconds; some payloads use milliseconds.
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return Option.getOrNull(Option.map(DateTime.make(ms), (dt) => DateTime.formatIso(dt)));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(trimmed)) {
      return toIsoResetsAt(asNum);
    }
    return Option.getOrNull(Option.map(DateTime.make(trimmed), (dt) => DateTime.formatIso(dt)));
  }
  return null;
}

function makeWindow(
  id: string,
  usedPercent: number,
  resetsAt: string | null,
  labelOverride?: string,
): AccountUsageWindow {
  const used = clampPercent(usedPercent);
  return {
    id,
    label: labelOverride ?? WINDOW_LABELS[id] ?? id.replaceAll("_", " "),
    usedPercent: used,
    remainingPercent: clampPercent(100 - used),
    resetsAt,
  };
}

function windowFromUtilizationObject(
  id: string,
  value: unknown,
  labelOverride?: string,
): AccountUsageWindow | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const utilization =
    asNumber(record.utilization) ??
    asNumber(record.usedPercent) ??
    asNumber(record.used_percent) ??
    asNumber(record.used);
  if (utilization === null) {
    return null;
  }
  const remaining = asNumber(record.remainingPercent) ?? asNumber(record.remaining_percent);
  const resetsAt = toIsoResetsAt(record.resets_at ?? record.resetsAt ?? record.resetAt);
  const window = makeWindow(id, utilization, resetsAt, labelOverride);
  if (remaining !== null) {
    return { ...window, remainingPercent: clampPercent(remaining) };
  }
  return window;
}

/**
 * Merge windows by id, preferring newer usedPercent when both exist.
 */
export function mergeUsageWindows(
  existing: ReadonlyArray<AccountUsageWindow>,
  incoming: ReadonlyArray<AccountUsageWindow>,
): AccountUsageWindow[] {
  const byId = new Map<string, AccountUsageWindow>();
  for (const window of existing) {
    byId.set(window.id, window);
  }
  for (const window of incoming) {
    byId.set(window.id, window);
  }
  const order = [
    "five_hour",
    "primary",
    "seven_day",
    "secondary",
    "seven_day_sonnet",
    "seven_day_opus",
    "seven_day_oauth_apps",
    "overage",
    "extra_usage",
    "individual",
  ];
  const ordered: AccountUsageWindow[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const window = byId.get(id);
    if (window) {
      ordered.push(window);
      seen.add(id);
    }
  }
  for (const [id, window] of byId) {
    if (!seen.has(id)) {
      ordered.push(window);
    }
  }
  return ordered;
}

function extractClaudeWindows(payload: unknown): AccountUsageWindow[] {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  // Full experimental /usage shape: { rate_limits: { five_hour, seven_day_opus, ... } }
  const rateLimitsRoot =
    asRecord(root.rate_limits) ??
    asRecord(root.rateLimits) ??
    (asRecord(root.rateLimits)?.rateLimits
      ? asRecord((asRecord(root.rateLimits) as Record<string, unknown>).rateLimits)
      : null);

  const windows: AccountUsageWindow[] = [];

  if (rateLimitsRoot) {
    for (const key of [
      "five_hour",
      "seven_day",
      "seven_day_opus",
      "seven_day_sonnet",
      "seven_day_oauth_apps",
      "extra_usage",
    ] as const) {
      const window = windowFromUtilizationObject(key, rateLimitsRoot[key]);
      if (window) {
        windows.push(window);
      }
    }
  }

  // Push event: { type: "rate_limit_event", rate_limit_info: { utilization, rateLimitType, ... } }
  const info =
    asRecord(root.rate_limit_info) ??
    asRecord(root.rateLimitInfo) ??
    (asRecord(root.rateLimits) ? asRecord(asRecord(root.rateLimits)?.rate_limit_info) : null) ??
    (asRecord(root.rateLimits) ? asRecord(asRecord(root.rateLimits)?.rateLimitInfo) : null);

  if (info) {
    const type =
      asString(info.rateLimitType) ??
      asString(info.rate_limit_type) ??
      asString(info.type) ??
      "five_hour";
    const utilization = asNumber(info.utilization) ?? asNumber(info.usedPercent);
    if (utilization !== null) {
      windows.push(makeWindow(type, utilization, toIsoResetsAt(info.resetsAt ?? info.resets_at)));
    }
  }

  return windows;
}

function extractCodexWindows(payload: unknown): AccountUsageWindow[] {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  // Codex: { rateLimits: { primary, secondary, individualLimit, ... } } or nested once more.
  let snapshot =
    asRecord(root.rateLimits) ?? asRecord(root.rate_limits) ?? asRecord(root.limits) ?? root;

  // Adapter wraps as { rateLimits: event.payload } and payload may itself be { rateLimits: snapshot }.
  const nested = asRecord(snapshot?.rateLimits) ?? asRecord(snapshot?.rate_limits);
  if (nested && (nested.primary !== undefined || nested.secondary !== undefined)) {
    snapshot = nested;
  }

  if (!snapshot) {
    return [];
  }

  const windows: AccountUsageWindow[] = [];
  const primary = windowFromUtilizationObject("primary", snapshot.primary, "5 hour");
  if (primary) {
    windows.push(primary);
  }
  const secondary = windowFromUtilizationObject("secondary", snapshot.secondary, "Weekly");
  if (secondary) {
    windows.push(secondary);
  }

  const individual = asRecord(snapshot.individualLimit) ?? asRecord(snapshot.individual_limit);
  if (individual) {
    const remaining =
      asNumber(individual.remainingPercent) ?? asNumber(individual.remaining_percent);
    const used =
      remaining !== null
        ? clampPercent(100 - remaining)
        : (asNumber(individual.usedPercent) ?? asNumber(individual.used_percent));
    if (used !== null) {
      windows.push(makeWindow("individual", used, toIsoResetsAt(individual.resetsAt), "Limit"));
    }
  }

  return windows;
}

export function normalizeRateLimitPayload(input: {
  readonly provider: ProviderDriverKind;
  readonly providerInstanceId: ProviderInstanceId | string;
  readonly displayName?: string;
  readonly payload: unknown;
  readonly updatedAt: string;
  readonly existing?: AccountUsageProviderSnapshot | null;
}): AccountUsageProviderSnapshot | null {
  const provider = input.provider;
  const rawPayload = input.payload;
  const root = asRecord(rawPayload);
  // Adapter stores { rateLimits: message }. Unwrap once for extractors.
  const unwrapped = root?.rateLimits !== undefined ? root.rateLimits : rawPayload;

  const providerKey = String(provider);
  const isClaudeFamily =
    providerKey === "claude" || providerKey === "claudeAgent" || providerKey === "cursor";
  const isCodexFamily = providerKey === "codex";

  const extracted = isClaudeFamily
    ? extractClaudeWindows(unwrapped)
    : isCodexFamily
      ? extractCodexWindows(unwrapped)
      : [...extractClaudeWindows(unwrapped), ...extractCodexWindows(unwrapped)];

  if (extracted.length === 0 && (!input.existing || input.existing.windows.length === 0)) {
    return null;
  }

  const windows = mergeUsageWindows(input.existing?.windows ?? [], extracted);
  if (windows.length === 0) {
    return null;
  }

  const instanceId =
    typeof input.providerInstanceId === "string"
      ? ProviderInstanceIdBrand.make(input.providerInstanceId)
      : input.providerInstanceId;

  const defaultDisplayName = isClaudeFamily
    ? "Claude"
    : isCodexFamily
      ? "Codex"
      : providerKey === "opencode"
        ? "OpenCode"
        : providerKey;

  return {
    providerInstanceId: instanceId,
    provider,
    displayName: input.displayName ?? input.existing?.displayName ?? defaultDisplayName,
    windows,
    updatedAt: input.updatedAt,
  };
}
