import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

/**
 * Soft-fork: plan / subscription rate-limit windows (Claude 5h & 7d model
 * buckets, Codex primary/secondary, etc.). Used percent is 0–100 utilization;
 * remaining is derived client-side as 100 − used when not provided.
 */
export const AccountUsageWindowId = TrimmedNonEmptyString;
export type AccountUsageWindowId = typeof AccountUsageWindowId.Type;

export const AccountUsageWindow = Schema.Struct({
  id: AccountUsageWindowId,
  label: TrimmedNonEmptyString,
  usedPercent: Schema.Number,
  remainingPercent: Schema.Number,
  resetsAt: Schema.NullOr(IsoDateTime),
});
export type AccountUsageWindow = typeof AccountUsageWindow.Type;

export const AccountUsageProviderSnapshot = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  provider: ProviderDriverKind,
  displayName: TrimmedNonEmptyString,
  windows: Schema.Array(AccountUsageWindow),
  updatedAt: IsoDateTime,
});
export type AccountUsageProviderSnapshot = typeof AccountUsageProviderSnapshot.Type;

export const AccountUsageSnapshot = Schema.Struct({
  providers: Schema.Array(AccountUsageProviderSnapshot),
  updatedAt: IsoDateTime,
});
export type AccountUsageSnapshot = typeof AccountUsageSnapshot.Type;
