import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { usageResponseToRateLimitPayload } from "./ClaudeUsagePoller.ts";
import { mergeUsageWindows, normalizeRateLimitPayload } from "./normalizeAccountUsage.ts";

describe("normalizeRateLimitPayload", () => {
  it("parses Claude rate_limit_event single window", () => {
    const snapshot = normalizeRateLimitPayload({
      provider: ProviderDriverKind.make("claudeAgent"),
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      payload: {
        rateLimits: {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed",
            rateLimitType: "five_hour",
            utilization: 42,
            resetsAt: 1_700_000_000,
          },
        },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.windows).toEqual([
      expect.objectContaining({
        id: "five_hour",
        label: "5 hour",
        usedPercent: 42,
        remainingPercent: 58,
      }),
    ]);
  });

  it("returns null for a Claude rate_limit_event without any usage numbers", () => {
    const snapshot = normalizeRateLimitPayload({
      provider: ProviderDriverKind.make("claudeAgent"),
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      payload: {
        rateLimits: {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed",
            resetsAt: 1_785_487_800,
            rateLimitType: "five_hour",
            overageStatus: "rejected",
            overageDisabledReason: "org_level_disabled",
            isUsingOverage: false,
          },
        },
      },
      updatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(snapshot).toBeNull();
  });

  it("falls back to surpassedThreshold when utilization is missing", () => {
    const snapshot = normalizeRateLimitPayload({
      provider: ProviderDriverKind.make("claudeAgent"),
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      payload: {
        rateLimits: {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed_warning",
            resetsAt: 1_785_487_800,
            rateLimitType: "five_hour",
            surpassedThreshold: 50,
          },
        },
      },
      updatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(snapshot?.windows).toEqual([
      expect.objectContaining({
        id: "five_hour",
        usedPercent: 50,
        remainingPercent: 50,
      }),
    ]);
  });

  it("parses an OAuth /usage response through the poller payload wrapper", () => {
    const snapshot = normalizeRateLimitPayload({
      provider: ProviderDriverKind.make("claudeAgent"),
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      displayName: "Claude",
      payload: usageResponseToRateLimitPayload({
        five_hour: { utilization: 23, resets_at: "2026-07-31T05:00:00.000Z" },
        seven_day: { utilization: 61.5, resets_at: "2026-08-03T00:00:00.000Z" },
        seven_day_opus: { utilization: 12, resets_at: null },
      }),
      updatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(snapshot?.displayName).toBe("Claude");
    expect(snapshot?.windows.map((w) => w.id)).toEqual([
      "five_hour",
      "seven_day",
      "seven_day_opus",
    ]);
    expect(snapshot?.windows.find((w) => w.id === "seven_day")?.remainingPercent).toBe(38.5);
    expect(snapshot?.windows.find((w) => w.id === "five_hour")?.resetsAt).toBe(
      "2026-07-31T05:00:00.000Z",
    );
  });

  it("wraps a /usage response that already nests rate_limits", () => {
    const snapshot = normalizeRateLimitPayload({
      provider: ProviderDriverKind.make("claudeAgent"),
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      payload: usageResponseToRateLimitPayload({
        rate_limits: { five_hour: { utilization: 77, resets_at: null } },
      }),
      updatedAt: "2026-07-31T00:00:00.000Z",
    });

    expect(snapshot?.windows).toEqual([
      expect.objectContaining({ id: "five_hour", usedPercent: 77, remainingPercent: 23 }),
    ]);
  });

  it("parses Claude multi-window rate_limits map", () => {
    const snapshot = normalizeRateLimitPayload({
      provider: ProviderDriverKind.make("claudeAgent"),
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      payload: {
        rateLimits: {
          rate_limits: {
            five_hour: { utilization: 10, resets_at: "2026-01-01T05:00:00.000Z" },
            seven_day_sonnet: { utilization: 55, resets_at: null },
            seven_day_opus: { utilization: 80, resets_at: null },
          },
        },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(snapshot?.windows.map((w) => w.id)).toEqual([
      "five_hour",
      "seven_day_sonnet",
      "seven_day_opus",
    ]);
    expect(snapshot?.windows.find((w) => w.id === "seven_day_opus")?.remainingPercent).toBe(20);
  });

  it("parses Codex primary/secondary usedPercent windows", () => {
    const snapshot = normalizeRateLimitPayload({
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      payload: {
        rateLimits: {
          rateLimits: {
            primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_700_000_100 },
            secondary: { usedPercent: 60, windowDurationMins: 10080, resetsAt: null },
          },
        },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(snapshot?.windows).toEqual([
      expect.objectContaining({ id: "primary", remainingPercent: 75, label: "5 hour" }),
      expect.objectContaining({ id: "secondary", remainingPercent: 40, label: "Weekly" }),
    ]);
  });

  it("merges windows by id", () => {
    const merged = mergeUsageWindows(
      [{ id: "five_hour", label: "5 hour", usedPercent: 10, remainingPercent: 90, resetsAt: null }],
      [
        {
          id: "seven_day_opus",
          label: "Opus",
          usedPercent: 50,
          remainingPercent: 50,
          resetsAt: null,
        },
        { id: "five_hour", label: "5 hour", usedPercent: 30, remainingPercent: 70, resetsAt: null },
      ],
    );
    expect(merged.find((w) => w.id === "five_hour")?.usedPercent).toBe(30);
    expect(merged.map((w) => w.id)).toEqual(["five_hour", "seven_day_opus"]);
  });
});
