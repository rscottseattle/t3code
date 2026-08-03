const DESKTOP_BEARER_RETRY_TIMEOUT_MS = 20_000;
const DESKTOP_BEARER_RETRY_STEP_MS = 400;

let desktopBearerTokenPromise: Promise<string> | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableDesktopBearerError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }
  const text = `${error.name} ${error.message}`.toLowerCase();
  // Permanent IPC/schema failures should not burn the full retry window.
  if (text.includes("not a function") || text.includes("schema")) {
    return false;
  }
  return true;
}

/**
 * Resolve the main-process desktop bearer token for primary-environment HTTP.
 *
 * The renderer cannot talk to the local server with cookies (credentials are
 * omitted on the desktop path), so this token is required for session
 * bootstrap. Retries briefly when the backend is still finishing auth setup.
 */
export function readDesktopPrimaryBearerToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  const bridge = window.desktopBridge;
  if (!bridge) {
    return Promise.resolve(null);
  }

  desktopBearerTokenPromise ??= (async () => {
    const startedAt = Date.now();
    let lastError: unknown = new Error("Desktop bearer token was not issued.");

    while (Date.now() - startedAt < DESKTOP_BEARER_RETRY_TIMEOUT_MS) {
      try {
        const token = await bridge.getLocalEnvironmentBearerToken();
        if (typeof token === "string" && token.trim().length > 0) {
          return token;
        }
        lastError = new Error("Desktop bearer token was empty.");
      } catch (error) {
        lastError = error;
        if (!isRetryableDesktopBearerError(error)) {
          break;
        }
      }
      await wait(DESKTOP_BEARER_RETRY_STEP_MS);
    }

    desktopBearerTokenPromise = null;
    throw lastError;
  })().catch((error) => {
    desktopBearerTokenPromise = null;
    throw error;
  });

  return desktopBearerTokenPromise;
}

export function __resetDesktopPrimaryAuthForTests(): void {
  desktopBearerTokenPromise = null;
}
