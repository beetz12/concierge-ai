/**
 * Compliance-gated dispatch orchestrator.
 *
 * Sits between callers and any {@link CallBackend}: it resolves the full
 * {@link ComplianceCallContext} (tenant kill switch, suppression list,
 * callee-local time), runs the pure policy engine, and only then lets a
 * dispatch proceed.
 *
 * - deny  → a dispatch_audit_log row with `decision='deny'` + reasons
 *           (R-25), then a typed {@link ComplianceDenyError};
 * - allow → a call_authorizations row (R-1) + an audit row (R-24) are
 *           written, the engine's disclosure lines are merged into the call
 *           plan's prompt context (R-12), and the backend dispatch runs; the
 *           audit row is then stamped with the backend call id.
 *
 * All writes go through the API's service-role Supabase client (RLS treats
 * both tables as read-only ledgers for tenant users).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallBackend, CallPlan } from "../call-backend/types.js";
import { evaluate } from "./policy-engine.js";
import { resolveCalleeLocalTimes, resolveTargetLocale } from "./timezone.js";
import type {
  ComplianceCallContext,
  ComplianceChannel,
  ComplianceTaskType,
  DenyReason,
  PolicyDecision,
} from "./types.js";

/** A dispatch was refused by the policy engine (not a transport failure). */
export class ComplianceDenyError extends Error {
  constructor(readonly decision: PolicyDecision) {
    super(
      `Dispatch denied by compliance policy (${decision.policyVersion}): ` +
        decision.reasons.join(", "),
    );
    this.name = "ComplianceDenyError";
  }

  get reasons(): DenyReason[] {
    return this.decision.reasons;
  }
}

export interface CompliantDispatchRequest {
  /** The call plan a human reviewed; `plan.userApproved` is the approval gate. */
  plan: CallPlan;
  orgId: string;
  userId: string;
  taskType: ComplianceTaskType;
  channel?: ComplianceChannel;
}

export interface DispatchAuthorization {
  decision: PolicyDecision;
  /** dispatch_audit_log row for this decision (call_id backfilled later). */
  auditId: string;
  /** call_authorizations row proving who approved what, when (R-1). */
  authorizationId: string;
  /** The plan with the engine's disclosure lines merged into its context. */
  plan: CallPlan;
}

interface CompliantCallDispatcherDeps {
  supabase: SupabaseClient;
  /** Required only for {@link CompliantCallDispatcher.dispatch}. */
  backend?: CallBackend;
  /** Injectable clock for tests. */
  now?: () => Date;
}

export class CompliantCallDispatcher {
  constructor(private readonly deps: CompliantCallDispatcherDeps) {}

  /**
   * Evaluate WITHOUT recording or dispatching (slice 8 preflight, Gate 1).
   *
   * Resolves the same fully-populated context as {@link authorize} (kill
   * switch, suppression, callee-local time) and runs the pure engine, but
   * writes nothing and never throws on deny - the decision is the result.
   * Callers preview "would this dispatch be allowed?" so they typically set
   * `plan.userApproved: true` on the request; approval itself is still
   * enforced at dispatch time.
   */
  async preflight(
    request: CompliantDispatchRequest,
    options?: { redialBlocked?: boolean },
  ): Promise<PolicyDecision> {
    const now = this.deps.now?.() ?? new Date();
    const channel = request.channel ?? "voice";
    const context = await this.resolveContext(request, channel, now);
    return evaluate({
      ...context,
      redialBlocked: options?.redialBlocked ?? false,
    });
  }

  /**
   * Evaluate + record, without dispatching. Callers that dispatch through a
   * path other than a CallBackend (e.g. the LiveKit contractor-call service)
   * use this, then dispatch the returned disclosure-merged plan themselves
   * and stamp the backend call id via {@link recordDispatchedCall}.
   *
   * @throws ComplianceDenyError after writing the deny audit row.
   */
  async authorize(
    request: CompliantDispatchRequest,
    options?: { redialBlocked?: boolean },
  ): Promise<DispatchAuthorization> {
    const now = this.deps.now?.() ?? new Date();
    const channel = request.channel ?? "voice";
    const context = await this.resolveContext(request, channel, now);
    const decision = evaluate({
      ...context,
      redialBlocked: options?.redialBlocked ?? false,
    });

    if (!decision.allow) {
      await this.insertAuditRow(request, channel, decision, now, null);
      throw new ComplianceDenyError(decision);
    }

    const authorizationId = await this.insertAuthorizationRow(request, channel, now);
    const auditId = await this.insertAuditRow(request, channel, decision, now, null);

    return {
      decision,
      auditId,
      authorizationId,
      plan: mergeDisclosuresIntoPlan(request.plan, decision.disclosureLines),
    };
  }

  /** Full gate: authorize, dispatch via the backend, stamp the audit row. */
  async dispatch(
    request: CompliantDispatchRequest,
  ): Promise<{ callId: string; decision: PolicyDecision }> {
    const backend = this.deps.backend;
    if (!backend) {
      throw new Error("CompliantCallDispatcher.dispatch requires a call backend");
    }
    const authorization = await this.authorize(request);
    const { callId } = await backend.dispatchCall({
      ...authorization.plan,
      tenantId: request.orgId,
    });
    await this.recordDispatchedCall(authorization.auditId, callId);
    return { callId, decision: authorization.decision };
  }

  /** Backfill the backend call id onto an allow audit row (R-24). */
  async recordDispatchedCall(auditId: string, callId: string): Promise<void> {
    const { error } = await this.deps.supabase
      .from("dispatch_audit_log")
      .update({ call_id: callId })
      .eq("id", auditId);
    if (error) {
      throw new Error(`Failed to stamp call id on audit row: ${error.message}`);
    }
  }

  private async resolveContext(
    request: CompliantDispatchRequest,
    channel: ComplianceChannel,
    now: Date,
  ): Promise<ComplianceCallContext> {
    const { plan, orgId } = request;
    const locale = resolveTargetLocale(plan.phoneNumber);
    const [killSwitchActive, suppressionHit] = await Promise.all([
      this.readKillSwitch(orgId),
      this.checkSuppression(orgId, plan.phoneNumber, now),
    ]);

    return {
      orgId,
      targetNumber: plan.phoneNumber,
      targetState: locale.state,
      taskType: request.taskType,
      channel,
      requestedAtUtc: now.toISOString(),
      calleeLocalTimes: resolveCalleeLocalTimes(plan.phoneNumber, now),
      onBehalfOfEntity: plan.callerIdentity,
      callbackNumber: plan.callbackNumber,
      userApproved: plan.userApproved === true,
      killSwitchActive,
      suppressionHit,
      // No recipient-consent records exist yet (R-2 lands with campaign
      // features); `none` fails safe — solicitation task types deny.
      recipientConsentTier: "none",
    };
  }

  private async readKillSwitch(orgId: string): Promise<boolean> {
    const { data, error } = await this.deps.supabase
      .from("tenant_settings")
      .select("outbound_kill_switch")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      // A gate that cannot read its inputs must not dial (fail closed, R-6).
      throw new Error(`Failed to read tenant kill switch: ${error.message}`);
    }
    return data?.outbound_kill_switch === true;
  }

  private async checkSuppression(
    orgId: string,
    phoneNumber: string,
    now: Date,
  ): Promise<boolean> {
    const { data, error } = await this.deps.supabase
      .from("suppression_entries")
      .select("id")
      .eq("phone_number", phoneNumber)
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .limit(1);
    if (error) {
      throw new Error(`Failed to check suppression list: ${error.message}`);
    }
    return (data?.length ?? 0) > 0;
  }

  private async insertAuthorizationRow(
    request: CompliantDispatchRequest,
    channel: ComplianceChannel,
    now: Date,
  ): Promise<string> {
    const { data, error } = await this.deps.supabase
      .from("call_authorizations")
      .insert({
        org_id: request.orgId,
        user_id: request.userId,
        call_plan_hash: hashCallPlan(request.plan),
        channel,
        approved_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(
        `Failed to write call authorization: ${error?.message ?? "no row returned"}`,
      );
    }
    return data.id as string;
  }

  private async insertAuditRow(
    request: CompliantDispatchRequest,
    channel: ComplianceChannel,
    decision: PolicyDecision,
    now: Date,
    callId: string | null,
  ): Promise<string> {
    const { data, error } = await this.deps.supabase
      .from("dispatch_audit_log")
      .insert({
        org_id: request.orgId,
        decision: decision.allow ? "allow" : "deny",
        reasons: decision.reasons,
        policy_version: decision.policyVersion,
        target_number: request.plan.phoneNumber,
        task_type: request.taskType,
        channel,
        call_id: callId,
        evaluated_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(
        `Failed to write dispatch audit row: ${error?.message ?? "no row returned"}`,
      );
    }
    return data.id as string;
  }
}

/**
 * Hash of the exact plan the human approved (R-1 `plan_hash`): a stable
 * digest over the dispatch-relevant fields, computed BEFORE disclosure
 * merging so it matches what was reviewed.
 */
export function hashCallPlan(plan: CallPlan): string {
  const canonical = JSON.stringify({
    businessName: plan.businessName,
    phoneNumber: plan.phoneNumber,
    objective: plan.objective,
    context: plan.context,
    mustAsk: plan.mustAsk,
    callerIdentity: plan.callerIdentity,
    callbackNumber: plan.callbackNumber ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Merge the engine's ordered disclosure lines into the plan's prompt context
 * so the prompt layer renders what the engine computed (R-12).
 */
export function mergeDisclosuresIntoPlan(
  plan: CallPlan,
  disclosureLines: string[],
): CallPlan {
  return { ...plan, context: [formatDisclosureBlock(disclosureLines), plan.context].join("\n\n") };
}

/** Human/prompt-readable rendering of the ordered disclosure block. */
export function formatDisclosureBlock(disclosureLines: string[]): string {
  const numbered = disclosureLines
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
  return `REQUIRED COMPLIANCE DISCLOSURES — open the call by saying these lines, in order:\n${numbered}`;
}
