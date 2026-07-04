/**
 * Zod schemas validating Retell API payloads at the service boundary.
 *
 * Schemas are intentionally loose (`passthrough`, plain-string enums): they
 * pin down only the fields this adapter relies on while preserving unknown
 * fields so the full call object can be persisted verbatim in `call.json`.
 */
import { z } from "zod";

/** Call statuses Retell reports (see GET /v2/get-call). */
export const RETELL_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "ended",
  "error",
  "not_connected",
]);

export const retellCallAnalysisSchema = z
  .object({
    call_summary: z.string().nullish(),
    call_successful: z.boolean().nullish(),
    user_sentiment: z.string().nullish(),
    custom_analysis_data: z.record(z.unknown()).nullish(),
  })
  .passthrough();

export const retellCallSchema = z
  .object({
    call_id: z.string(),
    call_status: z.string(),
    disconnection_reason: z.string().nullish(),
    from_number: z.string().nullish(),
    to_number: z.string().nullish(),
    duration_ms: z.number().nullish(),
    start_timestamp: z.number().nullish(),
    end_timestamp: z.number().nullish(),
    transcript: z.string().nullish(),
    recording_url: z.string().nullish(),
    metadata: z.record(z.unknown()).nullish(),
    call_analysis: retellCallAnalysisSchema.nullish(),
  })
  .passthrough();

export type RetellCall = z.infer<typeof retellCallSchema>;

export const retellCallListSchema = z.array(retellCallSchema);

export const retellDispatchResponseSchema = z
  .object({
    call_id: z.string(),
    call_status: z.string().optional(),
  })
  .passthrough();

export const retellAgentSchema = z
  .object({
    agent_id: z.string(),
    agent_name: z.string().nullish(),
  })
  .passthrough();

export type RetellAgent = z.infer<typeof retellAgentSchema>;

export const retellAgentListSchema = z.array(retellAgentSchema);

export const retellLlmSchema = z
  .object({
    llm_id: z.string(),
  })
  .passthrough();

export const retellPhoneNumberSchema = z
  .object({
    phone_number: z.string(),
  })
  .passthrough();

export const retellPhoneNumberListSchema = z.array(retellPhoneNumberSchema);
