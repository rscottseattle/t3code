/**
 * Soft-fork: in-process hub for plan/subscription usage windows.
 * Updated from provider rate-limit events; streamed to the web client.
 */
import type { AccountUsageProviderSnapshot, AccountUsageSnapshot } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { mergeUsageWindows } from "./normalizeAccountUsage.ts";

const EMPTY_UPDATED_AT = "1970-01-01T00:00:00.000Z";

function emptySnapshot(updatedAt = EMPTY_UPDATED_AT): AccountUsageSnapshot {
  return { providers: [], updatedAt };
}

const stateRef = Effect.runSync(Ref.make<AccountUsageSnapshot>(emptySnapshot()));
const changesPubSub = Effect.runSync(PubSub.unbounded<AccountUsageSnapshot>());

function sortProviders(
  providers: ReadonlyArray<AccountUsageProviderSnapshot>,
): AccountUsageProviderSnapshot[] {
  return [...providers].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function getAccountUsageSnapshot(): AccountUsageSnapshot {
  return Effect.runSync(Ref.get(stateRef));
}

export function publishAccountUsageProvider(
  providerSnapshot: AccountUsageProviderSnapshot,
): AccountUsageSnapshot {
  return Effect.runSync(
    Effect.gen(function* () {
      const current = yield* Ref.get(stateRef);
      const existing = current.providers.find(
        (entry) => entry.providerInstanceId === providerSnapshot.providerInstanceId,
      );
      const merged: AccountUsageProviderSnapshot = existing
        ? {
            ...providerSnapshot,
            windows: mergeUsageWindows(existing.windows, providerSnapshot.windows),
            displayName: providerSnapshot.displayName || existing.displayName,
          }
        : providerSnapshot;

      const providers = sortProviders([
        ...current.providers.filter(
          (entry) => entry.providerInstanceId !== merged.providerInstanceId,
        ),
        merged,
      ]);
      const next: AccountUsageSnapshot = {
        providers,
        updatedAt: merged.updatedAt,
      };
      yield* Ref.set(stateRef, next);
      yield* PubSub.publish(changesPubSub, next);
      return next;
    }),
  );
}

export function subscribeAccountUsage(): Effect.Effect<
  {
    readonly latest: AccountUsageSnapshot;
    readonly changes: Stream.Stream<AccountUsageSnapshot>;
  },
  never,
  Scope.Scope
> {
  return Effect.gen(function* () {
    const latest = yield* Ref.get(stateRef);
    const subscription = yield* PubSub.subscribe(changesPubSub);
    return {
      latest,
      changes: Stream.fromSubscription(subscription),
    };
  });
}

export function accountUsageStream(): Stream.Stream<AccountUsageSnapshot> {
  return Stream.unwrap(
    Effect.map(subscribeAccountUsage(), ({ latest, changes }) =>
      Stream.concat(Stream.make(latest), changes),
    ),
  );
}
