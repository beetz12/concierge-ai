import axios from "axios";
import { serializeError } from "../../utils/error.js";
import type { WebSearchDocument, WebSearchRequest } from "./types.js";
import type { WebSearchProvider } from "./web-search-provider.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export class BraveSearchProvider implements WebSearchProvider {
  private readonly apiKey: string | null;
  private readonly baseUrl = "https://api.search.brave.com/res/v1/web/search";
  private readonly retryDelayMs = 1200;
  private readonly maxAttempts = 3;

  constructor(private logger: Logger, apiKey?: string) {
    this.apiKey = apiKey || process.env.BRAVE_SEARCH_API_KEY || null;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async search(request: WebSearchRequest): Promise<WebSearchDocument[]> {
    if (!this.apiKey) {
      return [];
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await axios.get(this.baseUrl, {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": this.apiKey,
          },
          params: {
            q: request.query,
            count: request.count ?? 10,
            result_filter: "web",
            text_decorations: false,
          },
        });

        const results = Array.isArray(response.data?.web?.results)
          ? response.data.web.results
          : [];

        return results
          .map((result: Record<string, unknown>) => ({
            title:
              typeof result.title === "string"
                ? result.title
                : typeof result.meta_title === "string"
                  ? result.meta_title
                  : "",
            url: typeof result.url === "string" ? result.url : "",
            snippet:
              typeof result.description === "string"
                ? result.description
                : typeof result.snippet === "string"
                  ? result.snippet
                  : undefined,
            sourceEngine: "brave" as const,
          }))
          .filter(
            (
              result: WebSearchDocument,
            ): result is WebSearchDocument & { title: string; url: string } =>
              Boolean(result.title) && Boolean(result.url),
          );
      } catch (error) {
        const status =
          axios.isAxiosError(error) && error.response
            ? error.response.status
            : undefined;

        if (status === 429 && attempt < this.maxAttempts) {
          this.logger.warn(
            {
              attempt,
              maxAttempts: this.maxAttempts,
              delayMs: this.retryDelayMs * attempt,
              query: request.query,
            },
            "Brave rate limited the request, retrying with backoff",
          );
          await this.sleep(this.retryDelayMs * attempt);
          continue;
        }

        this.logger.error(
          { error: serializeError(error), query: request.query, attempt },
          "Brave web search failed",
        );
        return [];
      }
    }

    return [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
