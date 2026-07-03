/**
 * Idempotent Retell resource bootstrap + health checks.
 *
 * `ensureProvisioned()` guarantees an outbound agent exists (reusing a
 * configured agent id, or looking one up by name, or creating an LLM +
 * agent pair exactly once). Phone numbers are only verified — never
 * purchased. `doctor()` mirrors the call-biz doctor command: key, config,
 * API reachability, agent, and number checks.
 */
import {
  RetellHttpClient,
  describeApiError,
  RetellHttpError,
} from "./retell-http.js";
import {
  retellAgentListSchema,
  retellAgentSchema,
  retellLlmSchema,
  retellPhoneNumberListSchema,
} from "./schemas.js";

export const DEFAULT_RETELL_AGENT_NAME = "concierge-outbound-caller";

export const DEFAULT_RETELL_VOICE_ID = "11labs-Adrian";

/**
 * Outbound caller prompt. The dynamic-variable contract
 * ({{business_name}}, {{objective}}, {{context}}, {{must_ask}},
 * {{caller_identity}}, {{callback_number}}) mirrors the call-biz dispatch
 * payload exactly, so calls dispatched by this backend and by call-biz are
 * interchangeable against the same agent.
 */
export const OUTBOUND_AGENT_PROMPT = `You are {{caller_identity}}, making a brief, polite phone call to {{business_name}}.

Objective: {{objective}}

Background you may share if relevant: {{context}}

Before ending the call you must ask, and get answers to: {{must_ask}}

Rules:
- Be concise, friendly, and natural. Ask one question at a time.
- If asked whether you are an AI, say yes: you are an AI assistant calling on behalf of a customer.
- If asked for a callback number, give: {{callback_number}}
- If you reach voicemail or an automated answering system, hang up without leaving a message.
- Once your questions are answered (or clearly cannot be answered), thank them and end the call politely.`;

export interface RetellProvisioningConfig {
  /** Existing agent id to reuse; when set, provisioning never creates. */
  agentId?: string;
  /** Existing Retell LLM id to bind when creating the agent. */
  llmId?: string;
  /** Outbound caller id (E.164) that must exist on the Retell account. */
  fromNumber?: string;
  /** Idempotency key for lookup/create when no agentId is set. */
  agentName?: string;
  /** Voice used when the agent is auto-created. */
  voiceId?: string;
}

export interface RetellProvisionResult {
  agentId: string;
  llmId: string | null;
  fromNumber: string | null;
  created: { llm: boolean; agent: boolean };
}

export interface RetellDoctorReport {
  ok: boolean;
  /** Per-check status: "ok" or a human-readable failure description. */
  checks: Record<string, string>;
}

export class RetellProvisioner {
  private provisionPromise: Promise<RetellProvisionResult> | undefined;

  constructor(
    private readonly client: RetellHttpClient,
    private readonly config: RetellProvisioningConfig = {},
  ) {}

  private get agentName(): string {
    return this.config.agentName ?? DEFAULT_RETELL_AGENT_NAME;
  }

  /**
   * Ensure the outbound agent (and its LLM) exist, creating them at most
   * once. Safe to call repeatedly and concurrently — the in-flight result
   * is cached; a failure clears the cache so the next call retries.
   */
  async ensureProvisioned(): Promise<RetellProvisionResult> {
    this.provisionPromise ??= this.provision();
    try {
      return await this.provisionPromise;
    } catch (error) {
      this.provisionPromise = undefined;
      throw error;
    }
  }

  private async provision(): Promise<RetellProvisionResult> {
    const agents = retellAgentListSchema.parse(
      await this.client.requestOk("GET", "/list-agents"),
    );
    const created = { llm: false, agent: false };
    let llmId: string | null = this.config.llmId ?? null;
    let agentId: string;

    if (this.config.agentId) {
      const existing = agents.find(
        (agent) => agent.agent_id === this.config.agentId,
      );
      if (!existing) {
        throw new Error(
          `Configured Retell agent ${this.config.agentId} was not found on ` +
            "this account. Fix RETELL_AGENT_ID, or clear it to auto-provision " +
            `an agent named "${this.agentName}".`,
        );
      }
      agentId = existing.agent_id;
    } else {
      const existing = agents.find(
        (agent) => agent.agent_name === this.agentName,
      );
      if (existing) {
        agentId = existing.agent_id;
      } else {
        if (!llmId) {
          const llm = retellLlmSchema.parse(
            await this.client.requestOk("POST", "/create-retell-llm", {
              general_prompt: OUTBOUND_AGENT_PROMPT,
              general_tools: [
                {
                  name: "end_call",
                  type: "end_call",
                  description: "End the call with the user.",
                },
              ],
              default_dynamic_variables: {
                business_name: "the business",
                objective: "a brief inquiry",
                context: "No additional context provided.",
                must_ask: "the objective above",
                caller_identity:
                  "an assistant calling on behalf of a local customer",
                callback_number: "",
              },
            }),
          );
          llmId = llm.llm_id;
          created.llm = true;
        }
        const agent = retellAgentSchema.parse(
          await this.client.requestOk("POST", "/create-agent", {
            agent_name: this.agentName,
            voice_id: this.config.voiceId ?? DEFAULT_RETELL_VOICE_ID,
            response_engine: { type: "retell-llm", llm_id: llmId },
          }),
        );
        agentId = agent.agent_id;
        created.agent = true;
      }
    }

    // Numbers are verified, never purchased (buying costs money and needs
    // a human decision in the Retell dashboard).
    const fromNumber = this.config.fromNumber ?? null;
    if (fromNumber) {
      const numbers = retellPhoneNumberListSchema.parse(
        await this.client.requestOk("GET", "/list-phone-numbers"),
      );
      if (!numbers.some((number) => number.phone_number === fromNumber)) {
        throw new Error(
          `Retell from-number ${fromNumber} is not attached to this ` +
            "account. Buy or import it in the Retell dashboard first.",
        );
      }
    }

    return { agentId, llmId, fromNumber, created };
  }

  /** Verify key, config, API reachability, agent, and number (call-biz doctor). */
  async doctor(): Promise<RetellDoctorReport> {
    const checks: Record<string, string> = {};
    checks["key"] = this.client.hasApiKey ? "ok" : "missing RETELL_API_KEY";
    checks["config"] = this.config.fromNumber
      ? "ok"
      : "incomplete: RETELL_FROM_NUMBER not set";

    let agents: ReturnType<typeof retellAgentListSchema.parse> | null = null;
    try {
      const { status, json } = await this.client.request("GET", "/list-agents");
      if (status === 200) {
        agents = retellAgentListSchema.parse(json);
        checks["api"] = "ok";
      } else {
        checks["api"] = `HTTP ${status}: ${describeApiError(json)}`;
      }
    } catch (error) {
      checks["api"] = errorSummary(error);
    }

    if (agents) {
      if (this.config.agentId) {
        checks["agent"] = agents.some(
          (agent) => agent.agent_id === this.config.agentId,
        )
          ? "ok"
          : `agent ${this.config.agentId} NOT FOUND`;
      } else {
        checks["agent"] = agents.some(
          (agent) => agent.agent_name === this.agentName,
        )
          ? "ok"
          : `agent "${this.agentName}" not provisioned (run ensureProvisioned)`;
      }
    }

    if (this.config.fromNumber) {
      try {
        const { status, json } = await this.client.request(
          "GET",
          "/list-phone-numbers",
        );
        if (status === 200) {
          const numbers = retellPhoneNumberListSchema.parse(json);
          checks["number"] = numbers.some(
            (number) => number.phone_number === this.config.fromNumber,
          )
            ? "ok"
            : `number ${this.config.fromNumber} NOT FOUND`;
        } else {
          checks["number"] = `HTTP ${status}: ${describeApiError(json)}`;
        }
      } catch (error) {
        checks["number"] = errorSummary(error);
      }
    }

    const ok = Object.values(checks).every((value) => value === "ok");
    return { ok, checks };
  }
}

function errorSummary(error: unknown): string {
  if (error instanceof RetellHttpError) {
    return `HTTP ${error.status}: ${describeApiError(error.body)}`;
  }
  return error instanceof Error ? error.message : String(error);
}
