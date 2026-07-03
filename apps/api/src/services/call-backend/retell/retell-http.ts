/**
 * Minimal HTTP client for the Retell AI REST API.
 *
 * Mirrors the semantics of the proven `call-biz` CLI: bearer-token auth,
 * JSON in/out, bounded retries on transient network failures (never on HTTP
 * error responses), and tolerant parsing of empty/non-JSON bodies.
 *
 * `fetchImpl` is injectable so unit tests can run fully offline with a mocked
 * transport — no RETELL_API_KEY and no network required.
 */

export const RETELL_API_BASE_URL = "https://api.retellai.com";

const DEFAULT_MAX_TRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30_000;

export class RetellHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `Retell API request failed with HTTP ${status}`);
    this.name = "RetellHttpError";
  }
}

export interface RetellHttpClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Total attempts for transient network failures (default 3). */
  maxTries?: number;
  /** Base backoff between retries; multiplied by the attempt number. */
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface RetellResponse {
  status: number;
  json: unknown;
}

export class RetellHttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxTries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(options: RetellHttpClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? RETELL_API_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxTries = options.maxTries ?? DEFAULT_MAX_TRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get hasApiKey(): boolean {
    return this.apiKey.trim().length > 0;
  }

  /**
   * Perform a JSON request. HTTP error responses are returned (status +
   * parsed body) rather than thrown, mirroring call-biz's `req()`; only
   * transport-level failures are retried and ultimately thrown.
   */
  async request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<RetellResponse> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxTries; attempt++) {
      try {
        const response = await this.fetchImpl(this.baseUrl + path, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        return { status: response.status, json: await parseBody(response) };
      } catch (error) {
        // Transient network blip (timeout, reset, DNS). Retry with backoff.
        lastError = error;
        if (attempt < this.maxTries) {
          await sleep(this.retryDelayMs * attempt);
        }
      }
    }
    throw new Error(
      `Retell network failure after ${this.maxTries} tries: ${describeError(lastError)}`,
    );
  }

  /** Perform a request and throw {@link RetellHttpError} on a non-OK status. */
  async requestOk(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    okStatuses: readonly number[] = [200, 201],
  ): Promise<unknown> {
    const { status, json } = await this.request(method, path, body);
    if (!okStatuses.includes(status)) {
      throw new RetellHttpError(
        status,
        json,
        `Retell ${method} ${path} failed with HTTP ${status}: ${describeApiError(json)}`,
      );
    }
    return json;
  }

  /**
   * Download a binary resource (e.g. a call recording). Recording URLs
   * expire, so callers should fetch promptly after the call ends.
   */
  async fetchBinary(url: string): Promise<Buffer> {
    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new RetellHttpError(
        response.status,
        null,
        `Failed to download ${url}: HTTP ${response.status}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

async function parseBody(response: {
  text(): Promise<string>;
}): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function describeApiError(json: unknown): string {
  if (json && typeof json === "object" && "message" in json) {
    const message = (json as { message: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return JSON.stringify(json);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
