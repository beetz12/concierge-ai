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
      // Update provider if providerId is provided
      if (request.providerId) {
        await this.updateProvider(request.providerId, result);
      }

      // Create interaction log if serviceRequestId is provided
      if (request.serviceRequestId) {
        await this.createInteractionLog(request.serviceRequestId, result);
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
   */
  private async createInteractionLog(
    serviceRequestId: string,
    result: CallResult,
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

    const { error } = await this.supabase.from("interaction_logs").insert({
      request_id: serviceRequestId,
      step_name: "provider_call",
      status: result.status === "completed" ? "success" : "warning",
      detail:
        result.analysis.summary ||
        `Call to ${result.provider.name}: ${result.status}`,
      transcript: transcriptData,
    });

    if (error) {
      this.logger.error(
        {
          error,
          serviceRequestId,
        },
        "Failed to create interaction log",
      );
      throw error;
    }

    this.logger.debug({ serviceRequestId }, "Interaction log created");
  }
}
