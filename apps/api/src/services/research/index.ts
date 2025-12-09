/**
 * Research Service Module
 * Exports all research-related types and services
 */

export { ResearchService } from "./research.service.js";
export { KestraResearchClient } from "./kestra-research.client.js";
export { DirectResearchClient } from "./direct-research.client.js";
export { ProviderEnrichmentService } from "./enrichment.service.js";

export type {
  ResearchRequest,
  ResearchResult,
  Provider,
  SystemStatus,
  KestraExecutionStatus,
  KestraResearchOutput,
} from "./types.js";
