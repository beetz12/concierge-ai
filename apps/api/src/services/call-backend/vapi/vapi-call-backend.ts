/**
 * VAPI-backed {@link CallBackend}.
 *
 * Wraps the legacy VAPI Research-and-Book pipeline's underlying REST API
 * (`https://api.vapi.ai`) behind the provider-agnostic CallBackend
 * interface, selectable via `CALL_BACKEND=vapi`. This adapter does not
 * modify or depend on `services/vapi/**` — it talks to the same VAPI REST
 * surface directly so it can be constructed and tested standalone.
 *
 * Dispatch is fire-and-forget: `dispatchCall` returns as soon as VAPI
 * accepts the call, without waiting for completion. Callers poll
 * `getStatus`/`getArtifacts` to observe progress and outcome.
 */

import {
  mapPlanToVapiCallRequest,
  mapVapiCallResponseToArtifacts,
  mapVapiCallResponseToStatus,
  isUsE164,
  type VapiCallResponse,
} from "./mapping.js";
import type {
  CallArtifacts,
  CallBackend,
  CallBackendCapabilities,
  CallBackendId,
  CallPlan,
  CallStatus,
} from "../types.js";

const VAPI_BASE_URL = "https://api.vapi.ai";

export interface VapiCallBackendConfig {
  apiKey: string;
  phoneNumberId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Read VAPI configuration from the environment and construct a
 * {@link VapiCallBackend}.
 *
 * @throws if `VAPI_API_KEY` or `VAPI_PHONE_NUMBER_ID` is missing.
 */
export function createVapiCallBackendFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VapiCallBackend {
  const apiKey = env.VAPI_API_KEY?.trim();
  const phoneNumberId = env.VAPI_PHONE_NUMBER_ID?.trim();

  if (!apiKey || !phoneNumberId) {
    throw new Error(
      "VAPI_API_KEY and VAPI_PHONE_NUMBER_ID environment variables are required to use CALL_BACKEND=vapi",
    );
  }

  return new VapiCallBackend({ apiKey, phoneNumberId });
}

export class VapiCallBackend implements CallBackend {
  readonly id: CallBackendId = "vapi";

  // No optional capabilities are wired up for this adapter: the
  // voice-calls routes' pause/supervision/warm-transfer/DTMF endpoints
  // stay gated off for CALL_BACKEND=vapi.
  readonly capabilities: CallBackendCapabilities = {
    supportsPause: false,
    supportsSupervision: false,
    supportsWarmTransfer: false,
    supportsDtmf: false,
  };

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: VapiCallBackendConfig) {
    this.baseUrl = config.baseUrl ?? VAPI_BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async dispatchCall(plan: CallPlan): Promise<{ callId: string }> {
    if (!isUsE164(plan.phoneNumber)) {
      throw new Error(
        `VapiCallBackend only supports US E.164 destination numbers (+1XXXXXXXXXX); got: ${plan.phoneNumber}`,
      );
    }

    const body = mapPlanToVapiCallRequest(plan, this.config.phoneNumberId);

    const response = await this.fetchImpl(`${this.baseUrl}/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`VAPI create-call failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as VapiCallResponse | VapiCallResponse[];
    const call = Array.isArray(data) ? data[0] : data;

    if (!call || typeof call.id !== "string") {
      throw new Error("Unexpected response from VAPI create-call: missing call id");
    }

    return { callId: call.id };
  }

  async getStatus(callId: string): Promise<CallStatus> {
    const call = await this.fetchCall(callId);
    return mapVapiCallResponseToStatus(call);
  }

  async getArtifacts(callId: string): Promise<CallArtifacts> {
    const call = await this.fetchCall(callId);
    return mapVapiCallResponseToArtifacts(call);
  }

  /**
   * End an in-flight VAPI call.
   *
   * Best-effort: VAPI's public REST API does not document a dedicated
   * "hang up" endpoint alongside `POST /call` and `GET /call/{id}`. This
   * uses `PATCH /call/{id}` with `{ status: "ended" }`, the same mechanism
   * VAPI's dashboard/API reference shows for ending an active call. If a
   * call has already ended, VAPI is expected to no-op or error, and this
   * method treats a non-ok response as a soft failure (logged via the
   * thrown error message) rather than crashing the caller's flow.
   */
  async cancelCall(callId: string): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/call/${callId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "ended" }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`VAPI cancel-call failed (${response.status}): ${errorText}`);
    }
  }

  private async fetchCall(callId: string): Promise<VapiCallResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/call/${callId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`VAPI get-call failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as VapiCallResponse;
  }
}
