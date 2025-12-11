/**
 * VAPI Webhook Configuration
 * Single source of truth for webhook settings
 *
 * Used by:
 * - TypeScript: DirectVapiClient (imports from src/)
 * - JavaScript: Kestra scripts (imports from dist/)
 *
 * This follows the same pattern as assistant-config.ts
 */
import { createAssistantConfig } from "./assistant-config.js";
// ============================================================================
// WEBHOOK SERVER CONFIGURATION CONSTANTS
// ============================================================================
/**
 * Standard webhook server configuration
 * Used when configuring VAPI calls with webhook support
 */
export const WEBHOOK_SERVER_CONFIG = {
    timeoutSeconds: 20,
    serverMessages: ["status-update", "end-of-call-report"],
};
// ============================================================================
// WEBHOOK METADATA
// ============================================================================
/**
 * Creates metadata for VAPI webhook callbacks
 * This metadata travels with the call and is returned in webhook events
 *
 * @param request - The call request containing provider and service info
 */
export function createWebhookMetadata(request) {
    return {
        serviceRequestId: request.serviceRequestId || "",
        providerId: request.providerId || "",
        providerName: request.providerName,
        providerPhone: request.providerPhone,
        serviceNeeded: request.serviceNeeded,
        userCriteria: request.userCriteria,
        location: request.location,
        urgency: request.urgency,
    };
}
// ============================================================================
// WEBHOOK-ENABLED ASSISTANT CONFIG
// ============================================================================
/**
 * Creates VAPI assistant configuration with webhook support
 *
 * This merges the base assistant config with webhook-specific settings:
 * - server.url: Where VAPI sends webhook events
 * - server.timeoutSeconds: Webhook timeout
 * - serverMessages: Which events to receive
 *
 * @param request - The call request information
 * @param webhookUrl - URL where VAPI will send webhook events
 * @param customPrompt - Optional Gemini-generated custom prompt for Direct Tasks
 */
export function createWebhookAssistantConfig(request, webhookUrl, customPrompt) {
    // Get base configuration from shared assistant config
    const baseConfig = createAssistantConfig(request, customPrompt);
    // Merge with webhook-specific configuration
    return {
        ...baseConfig,
        server: {
            url: webhookUrl,
            timeoutSeconds: WEBHOOK_SERVER_CONFIG.timeoutSeconds,
        },
        serverMessages: WEBHOOK_SERVER_CONFIG.serverMessages,
    };
}
