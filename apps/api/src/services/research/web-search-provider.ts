import type { WebSearchDocument, WebSearchRequest } from "./types.js";

export interface WebSearchProvider {
  isAvailable(): boolean;
  search(request: WebSearchRequest): Promise<WebSearchDocument[]>;
}
