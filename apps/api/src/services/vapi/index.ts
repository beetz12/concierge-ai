/**
 * VAPI Services - Main exports
 * Provider calling system with Kestra/Direct VAPI fallback
 */

// Main service
export {
  ProviderCallingService,
  type SystemStatus,
} from "./provider-calling.service.js";

// Client implementations
export { KestraClient } from "./kestra.client.js";
export { DirectVapiClient } from "./direct-vapi.client.js";
export { CallResultService } from "./call-result.service.js";
export { WebhookCacheService } from "./webhook-cache.service.js";

// Configuration
export {
  createAssistantConfig,
  type AssistantConfig,
} from "./assistant-config.js";

// Types
export type {
  CallRequest,
  CallResult,
  StructuredCallData,
  KestraExecutionStatus,
  UrgencyType,
  CallStatus,
  CallMethod,
  AvailabilityStatus,
  CallOutcome,
} from "./types.js";
