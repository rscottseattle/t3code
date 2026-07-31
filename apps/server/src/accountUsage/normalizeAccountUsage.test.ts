import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

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
