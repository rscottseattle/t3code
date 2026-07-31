// @effect-diagnostics nodeBuiltinImport:off - reads Claude Code credentials (file + macOS keychain) at the OS boundary.
// @effect-diagnostics globalFetchInEffect:off - single best-effort call to an unofficial endpoint; HttpClient wiring buys nothing here.
/**
 * Soft-fork: background poller for Claude plan-usage windows.
 *
 * Live `rate_limit_event`s from the Claude SDK usually omit the
 * `utilization` percentage (it is optional in `SDKRateLimitInfo`), so
 * passive ingestion alone leaves the sidebar usage rings empty. This
 * poller reads the OAuth usage endpoint that the Claude Code `/usage`
 * command uses and publishes real window percentages to the
 * AccountUsageHub. The endpoint is unofficial and plan usage is
 * best-effort observability, so every failure path is silent (debug
 * logs only) and must never affect server startup or operation.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";

import { getAccountUsageSnapshot, publishAccountUsageProvider } from "./AccountUsageHub.ts";
import { normalizeRateLimitPayload } from "./normalizeAccountUsage.ts";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

const PROVIDER = ProviderDriverKind.make("claudeAgent");
// Matches ProviderRuntimeIngestion's fallback instance id
// (`String(event.provider)`) so live events and poller results merge into
// one provider entry instead of rendering two "Claude" sections.
const INSTANCE_ID = ProviderInstanceId.make("claudeAgent");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CREDENTIALS_PATH = NodePath.join(NodeOS.homedir(), ".claude", ".credentials.json");
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const STARTUP_DELAY = "5 seconds";
const POLL_INTERVAL = "5 minutes";
const FETCH_TIMEOUT_MS = 10_000;

function parseAccessToken(raw: string, nowMs: number): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown };
    };
    const oauth = parsed.claudeAiOauth;
    if (!oauth || typeof oauth.accessToken !== "string" || oauth.accessToken.length === 0) {
      return null;
    }
    // Claude Code refreshes this token itself during normal use; a stale
    // token means we skip the cycle rather than attempt a refresh here.
    if (typeof oauth.expiresAt === "number" && oauth.expiresAt < nowMs) {
      return null;
    }
    return oauth.accessToken;
  } catch {
    return null;
  }
}

const readCredentialsFile = (nowMs: number): Effect.Effect<string | null> =>
  Effect.tryPromise(() => NodeFSP.readFile(CREDENTIALS_PATH, "utf8")).pipe(
    Effect.map((raw) => parseAccessToken(raw, nowMs)),
    Effect.orElseSucceed(() => null),
  );

// The first call from a fresh install triggers a one-time macOS keychain
// approval dialog for the T3r process; "Always Allow" makes it silent.
const readKeychainCredentials = (nowMs: number): Effect.Effect<string | null> =>
  Effect.tryPromise(async () => {
    const { stdout } = await execFileAsync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { timeout: 5_000 },
    );
    return parseAccessToken(stdout.trim(), nowMs);
  }).pipe(Effect.orElseSucceed(() => null));

const resolveAccessToken: Effect.Effect<string | null> = Effect.gen(function* () {
  const nowMs = yield* Clock.currentTimeMillis;
  const fromFile = yield* readCredentialsFile(nowMs);
  if (fromFile !== null) {
    return fromFile;
  }
  const platform = yield* HostProcessPlatform;
  if (platform !== "darwin") {
    return null;
  }
  return yield* readKeychainCredentials(nowMs);
});

const fetchUsage = (accessToken: string): Effect.Effect<unknown> =>
  Effect.tryPromise(async () => {
    const response = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as unknown;
  }).pipe(Effect.orElseSucceed(() => null));

/**
 * The /usage response carries windows either at the top level
 * (`{ five_hour: {...}, seven_day: {...} }`) or under a `rate_limits`
 * key. Wrap so `normalizeRateLimitPayload` sees the full /usage shape
 * its Claude extractor already understands.
 */
export function usageResponseToRateLimitPayload(response: unknown): unknown {
  if (response !== null && typeof response === "object" && !Array.isArray(response)) {
    const record = response as Record<string, unknown>;
    if (record.rate_limits !== undefined || record.rateLimits !== undefined) {
      return { rateLimits: response };
    }
    return { rateLimits: { rate_limits: response } };
  }
  return { rateLimits: response };
}

const pollOnce = Effect.gen(function* () {
  const accessToken = yield* resolveAccessToken;
  if (accessToken === null) {
    yield* Effect.logDebug("No Claude Code OAuth token available; skipping usage poll.");
    return;
  }
  const usage = yield* fetchUsage(accessToken);
  if (usage === null || usage === undefined) {
    yield* Effect.logDebug("Claude usage endpoint returned no data; skipping usage poll.");
    return;
  }
  const existing =
    getAccountUsageSnapshot().providers.find((entry) => entry.providerInstanceId === INSTANCE_ID) ??
    null;
  const now = yield* DateTime.now;
  const normalized = normalizeRateLimitPayload({
    provider: PROVIDER,
    providerInstanceId: INSTANCE_ID,
    displayName: "Claude",
    payload: usageResponseToRateLimitPayload(usage),
    updatedAt: DateTime.formatIso(now),
    existing,
  });
  if (normalized !== null) {
    publishAccountUsageProvider(normalized);
  }
}).pipe(
  Effect.catchCause((cause) => Effect.logDebug("Claude usage poll failed.", { cause })),
  Effect.annotateLogs({ scope: "claude-usage-poller" }),
);

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    if (process.env.T3R_DISABLE_USAGE_POLLER === "1") {
      yield* Effect.logDebug("Claude usage poller disabled via T3R_DISABLE_USAGE_POLLER.");
      return;
    }
    yield* pollOnce.pipe(
      Effect.delay(STARTUP_DELAY),
      Effect.repeat(Schedule.spaced(POLL_INTERVAL)),
      Effect.forkScoped,
    );
  }),
);
