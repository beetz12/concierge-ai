/**
 * Call Result Service
 * Handles database updates for call results
 * Updates providers table and creates interaction logs
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { CallRequest, CallResult } from "./types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

// Helper to check if string is valid UUID format
const isValidUuid = (str: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

export class CallResultService {
  private supabase: SupabaseClient | null;

  constructor(private logger: Logger) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        {},
        "Supabase not configured, DB updates will be skipped",
      );
      this.supabase = null;
    } else {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  /**
   * Save call result to database
   * Updates provider record and creates interaction log
   */
  async saveCallResult(
    result: CallResult,
    request: CallRequest,
  ): Promise<void> {
    if (!this.supabase) {
      this.logger.info(
        { callId: result.callId },
        "Skipping DB update - Supabase not configured",
      );
      return;
    }

    try {
      // Update provider if providerId is provided AND is a valid UUID
      // Direct Tasks use non-UUID IDs (task-xxx) which are localStorage-only
      if (request.providerId && isValidUuid(request.providerId)) {
        await this.updateProvider(request.providerId, result);
      } else if (request.providerId) {
        this.logger.info(
          { providerId: request.providerId },
          "Skipping provider update - non-UUID ID (localStorage-only)",
        );
      }

      // Create interaction log if serviceRequestId is provided AND is a valid UUID
      // Direct Tasks use non-UUID IDs (task-xxx) which are localStorage-only
      if (request.serviceRequestId && isValidUuid(request.serviceRequestId)) {
        await this.createInteractionLog(request.serviceRequestId, result, request);
      } else if (request.serviceRequestId) {
        this.logger.info(
          { serviceRequestId: request.serviceRequestId },
          "Skipping interaction log - non-UUID ID (localStorage-only)",
        );
      }

      this.logger.info(
        {
          callId: result.callId,
          providerId: request.providerId,
          serviceRequestId: request.serviceRequestId,
        },
        "Call result saved to database",
      );
    } catch (error) {
      this.logger.error(
        {
          error,
          callId: result.callId,
        },
        "Failed to save call result to database",
      );
      // Don't throw - we don't want DB failures to break the call flow
    }
  }

  /**
   * Mark a provider call as in-progress.
   * Called immediately after VAPI call is created but before waiting for completion.
   * This triggers Supabase real-time for frontend progress updates.
   */
  async markCallInProgress(providerId: string, callId: string): Promise<void> {
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from("providers")
        .update({
          call_status: "in_progress",
          call_id: callId,
          called_at: new Date().toISOString(),
        })
        .eq("id", providerId);

      if (error) {
        this.logger.warn(
          { providerId, callId, error },
          "Failed to mark call in_progress"
        );
      } else {
        this.logger.info(
          { providerId, callId },
          "Provider call marked in_progress"
        );
      }
    } catch (err) {
      this.logger.error(
        { providerId, callId, error: err },
        "Error marking call in_progress"
      );
    }
  }

  /**
   * Update provider record with call results
   */
  private async updateProvider(
    providerId: string,
    result: CallResult,
  ): Promise<void> {
    if (!this.supabase) return;

    const { error } = await this.supabase
      .from("providers")
      .update({
        call_status: result.status,
        call_result: result.analysis.structuredData,
        call_transcript: result.transcript,
        call_summary: result.analysis.summary,
        call_duration_minutes: result.duration,
        call_cost: result.cost,
        call_method: result.callMethod,
        call_id: result.callId,
        called_at: new Date().toISOString(),
      })
      .eq("id", providerId);

    if (error) {
      this.logger.error(
        {
          error,
          providerId,
        },
        "Failed to update provider",
      );
      throw error;
    }

    this.logger.debug({ providerId }, "Provider updated with call result");
  }

  /**
   * Create interaction log for the call
   * Uses database-level unique constraint on call_id for deduplication (2025 best practice)
   * ON CONFLICT DO NOTHING handles duplicates atomically - no race conditions
   */
  private async createInteractionLog(
    serviceRequestId: string,
    result: CallResult,
    request: CallRequest,
  ): Promise<void> {
    if (!this.supabase) return;

    // Parse transcript into structured format if possible
    let transcriptData = null;
    if (result.transcript) {
      try {
        // Try to parse transcript lines into speaker/text format
        transcriptData = result.transcript
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => {
            const colonIndex = line.indexOf(": ");
            if (colonIndex > -1) {
              return {
                speaker: line.substring(0, colonIndex),
                text: line.substring(colonIndex + 2),
              };
            }
            return { speaker: "unknown", text: line };
          });
      } catch {
        // If parsing fails, store as single entry
        transcriptData = [{ speaker: "transcript", text: result.transcript }];
      }
    }

    // Build insert object with required fields
    // Include callId in detail for deduplication tracking
    const summaryWithCallId = result.callId
      ? `${result.analysis.summary || `Call to ${result.provider.name}: ${result.status}`} [Call ID: ${result.callId}]`
      : result.analysis.summary || `Call to ${result.provider.name}: ${result.status}`;

    // Map call status to interaction log status
    let logStatus: "success" | "warning" | "error" = "warning";
    if (result.status === "completed") {
      logStatus = "success";
    } else if (result.status === "error") {
      logStatus = "error";
    }
    // no_answer, voicemail stay as "warning"

    const insertData = {
      request_id: serviceRequestId,
      step_name: `Call to ${result.provider.name}`,
      status: logStatus,
      detail: summaryWithCallId,
      transcript: transcriptData,
      call_id: result.callId || null, // For unique constraint deduplication
    };

    // Use upsert with ON CONFLICT DO NOTHING for atomic deduplication
    // Database unique constraint on call_id prevents duplicates when both
    // webhook and polling paths call saveCallResult() simultaneously
    const { error } = await this.supabase
      .from("interaction_logs")
      .upsert(insertData, {
        onConflict: "call_id",
        ignoreDuplicates: true,
      });

    if (error) {
      this.logger.error(
        {
          error,
          serviceRequestId,
          callId: result.callId,
        },
        "Failed to create interaction log",
      );
      throw error;
    }

    this.logger.debug(
      { serviceRequestId, callId: result.callId },
      "Interaction log created (or duplicate ignored)",
    );
  }
}
