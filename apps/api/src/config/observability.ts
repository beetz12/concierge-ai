/**
 * Optional error-monitoring integration.
 *
 * Sentry is strictly opt-in: it initializes only when `SENTRY_DSN` is set AND
 * the `@sentry/node` package is installed. The package is loaded via a guarded
 * dynamic import so it is NOT a hard dependency -- the API builds, tests, and
 * runs identically whether or not `@sentry/node` is present. To enable error
 * reporting in production, `pnpm --filter api add @sentry/node` and set
 * `SENTRY_DSN` (and optionally `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`).
 *
 * `captureException` is a safe no-op until (and unless) Sentry initializes, so
 * the global error handler can always call it.
 */

interface MinimalSentry {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, hint?: Record<string, unknown>): void;
}

let sentry: MinimalSentry | null = null;
let initialized = false;

export interface ObservabilityLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

/**
 * Initialize Sentry if configured. Returns true when Sentry is active.
 * Safe to call once at startup; subsequent calls are no-ops.
 */
export async function initObservability(
  log?: ObservabilityLogger,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (initialized) return sentry !== null;
  initialized = true;

  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) {
    log?.info({ sentry: "disabled" }, "Sentry disabled (no SENTRY_DSN)");
    return false;
  }

  try {
    // Guarded dynamic import: @sentry/node is an optional peer. The
    // variable indirection keeps bundlers/TS from treating it as a hard
    // dependency when it is not installed.
    const moduleName = "@sentry/node";
    const mod = (await import(moduleName)) as unknown as MinimalSentry;
    if (typeof mod.init !== "function") {
      throw new Error("@sentry/node has no init()");
    }
    const tracesSampleRate = Number.parseFloat(
      env.SENTRY_TRACES_SAMPLE_RATE ?? "0",
    );
    mod.init({
      dsn,
      environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? "development",
      tracesSampleRate: Number.isFinite(tracesSampleRate)
        ? tracesSampleRate
        : 0,
    });
    sentry = mod;
    log?.info({ sentry: "enabled" }, "Sentry error monitoring initialized");
    return true;
  } catch (error) {
    // DSN set but @sentry/node not installed (or init failed): warn, do not
    // crash. Error monitoring stays off; logging still captures everything.
    log?.warn(
      { err: error },
      "SENTRY_DSN is set but @sentry/node could not be initialized; " +
        "install it with `pnpm --filter api add @sentry/node` to enable Sentry",
    );
    return false;
  }
}

/**
 * Report an exception to Sentry when active; a no-op otherwise. The global
 * error handler calls this on every 5xx.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentry) return;
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Never let error reporting throw inside an error handler.
  }
}

/** Test-only reset of module state. */
export function __resetObservabilityForTests(): void {
  sentry = null;
  initialized = false;
}
