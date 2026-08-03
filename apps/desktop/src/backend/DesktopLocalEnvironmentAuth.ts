import { bootstrapRemoteBearerSession } from "@t3tools/client-runtime/authorization";
import { PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as HttpClient from "effect/unstable/http/HttpClient";

import * as DesktopBackendPool from "./DesktopBackendPool.ts";

/** Backend can report HTTP-ready a moment before auth bootstrap is usable. */
const BEARER_BOOTSTRAP_RETRY_INTERVAL = Duration.millis(400);
const BEARER_BOOTSTRAP_RETRY_TIMES = 50; // ~20s

export class DesktopLocalEnvironmentAuthBackendNotConfiguredError extends Schema.TaggedErrorClass<DesktopLocalEnvironmentAuthBackendNotConfiguredError>()(
  "DesktopLocalEnvironmentAuthBackendNotConfiguredError",
  {},
) {
  override get message(): string {
    return "Local backend is not configured.";
  }
}

export class DesktopLocalEnvironmentAuthSessionBootstrapError extends Schema.TaggedErrorClass<DesktopLocalEnvironmentAuthSessionBootstrapError>()(
  "DesktopLocalEnvironmentAuthSessionBootstrapError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to create the local desktop bearer session.";
  }
}

export const DesktopLocalEnvironmentAuthError = Schema.Union([
  DesktopLocalEnvironmentAuthBackendNotConfiguredError,
  DesktopLocalEnvironmentAuthSessionBootstrapError,
]);
export type DesktopLocalEnvironmentAuthError = typeof DesktopLocalEnvironmentAuthError.Type;

export class DesktopLocalEnvironmentAuth extends Context.Service<
  DesktopLocalEnvironmentAuth,
  {
    readonly getBearerToken: Effect.Effect<string, DesktopLocalEnvironmentAuthError>;
  }
>()("@t3tools/desktop/backend/DesktopLocalEnvironmentAuth") {}

export const make = Effect.gen(function* () {
  const pool = yield* DesktopBackendPool.DesktopBackendPool;
  const httpClient = yield* HttpClient.HttpClient;
  const tokenRef = yield* Ref.make(Option.none<string>());
  const mutex = yield* Semaphore.make(1);

  const exchangeBearerTokenOnce = Effect.gen(function* () {
    const instances = yield* pool.list;
    const primary = instances.find((instance) => instance.id === PRIMARY_LOCAL_ENVIRONMENT_ID);
    const configOption = primary === undefined ? Option.none() : yield* primary.currentConfig;
    if (Option.isNone(configOption)) {
      return yield* new DesktopLocalEnvironmentAuthBackendNotConfiguredError();
    }
    const config = configOption.value;
    const credential = config.bootstrap.desktopBootstrapToken;
    if (!credential) {
      return yield* new DesktopLocalEnvironmentAuthBackendNotConfiguredError();
    }
    const session = yield* bootstrapRemoteBearerSession({
      httpBaseUrl: config.httpBaseUrl.href,
      credential,
      clientMetadata: {
        label: "T3r Desktop",
        deviceType: "desktop",
      },
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, httpClient),
      Effect.mapError(
        (cause) =>
          new DesktopLocalEnvironmentAuthSessionBootstrapError({
            cause,
          }),
      ),
    );
    return session.access_token;
  });

  const getBearerToken = mutex
    .withPermits(1)(
      Effect.gen(function* () {
        const cached = yield* Ref.get(tokenRef);
        if (Option.isSome(cached)) {
          return cached.value;
        }

        // HTTP readiness can flip true before oauth/token accepts the desktop
        // bootstrap credential. Retry briefly instead of failing the renderer
        // with a misleading "fetch-session-state HTTP 500".
        const accessToken = yield* exchangeBearerTokenOnce.pipe(
          Effect.retry({
            schedule: Schedule.spaced(BEARER_BOOTSTRAP_RETRY_INTERVAL).pipe(
              Schedule.upTo({ times: BEARER_BOOTSTRAP_RETRY_TIMES }),
            ),
          }),
        );
        yield* Ref.set(tokenRef, Option.some(accessToken));
        return accessToken;
      }),
    )
    .pipe(Effect.withSpan("desktop.localEnvironmentAuth.getBearerToken"));

  return DesktopLocalEnvironmentAuth.of({ getBearerToken });
});

export const layer = Layer.effect(DesktopLocalEnvironmentAuth, make);
