/**
 * Supabase-backed {@link MembershipStore}.
 *
 * Service-role usage justification: routes have already resolved the tenant
 * (request.auth.orgId via the auth middleware) and every query below is
 * filtered to that org id; org_phone_numbers / org_call_settings writes are
 * `WITH CHECK (false)` for user contexts so they can only happen server-side.
 *
 * `MembershipDbClient` is the minimal structural view of the Supabase client
 * these queries need, so unit tests can inject a mock without a database
 * (same pattern as billing's SubscriptionDbClient).
 */
import {
  OrgNumberConflictError,
  type MembershipStore,
  type NewOrgPhoneNumber,
  type OrgCallSettings,
  type OrgCallSettingsPatch,
  type OrgNumberStatus,
  type OrgPhoneNumber,
  type OrgSubscriptionState,
  type OrgSummary,
} from "./types.js";

type Row = Record<string, unknown>;

interface DbError {
  message: string;
  code?: string;
}

interface SingleResult {
  data: Row | null;
  error: DbError | null;
}

interface ListResult {
  data: Row[] | null;
  error: DbError | null;
}

export interface MembershipDbClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): PromiseLike<SingleResult>;
        limit(count: number): PromiseLike<ListResult>;
      };
    };
    insert(values: Row): {
      select(): { single(): PromiseLike<SingleResult> };
    };
    upsert(
      values: Row,
      options: { onConflict: string },
    ): {
      select(): { single(): PromiseLike<SingleResult> };
    };
  };
}

/** Postgres unique-violation SQLSTATE (org_id UNIQUE on org_phone_numbers). */
const UNIQUE_VIOLATION = "23505";

const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

function mapNumberRow(row: Row): OrgPhoneNumber {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    phoneE164: String(row.phone_e164),
    retellNumberRef: asString(row.retell_number_ref),
    status: row.status as OrgNumberStatus,
    areaCode: asString(row.area_code),
    purchasedAt: String(row.purchased_at),
    releasedAt: asString(row.released_at),
  };
}

function mapSettingsRow(row: Row): OrgCallSettings {
  return {
    orgId: String(row.org_id),
    callerIdentity: asString(row.caller_identity),
    voicemailPolicy:
      (row.voicemail_policy as OrgCallSettings["voicemailPolicy"]) ?? "hang_up",
    transferNumber: asString(row.transfer_number),
    updatedAt: asString(row.updated_at),
  };
}

export class SupabaseMembershipStore implements MembershipStore {
  constructor(private readonly db: MembershipDbClient) {}

  async getOrgPhoneNumber(orgId: string): Promise<OrgPhoneNumber | null> {
    const { data, error } = await this.db
      .from("org_phone_numbers")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      throw new Error(`membership: number lookup failed: ${error.message}`);
    }
    return data ? mapNumberRow(data) : null;
  }

  async findOrgPhoneNumberByPhone(
    phoneE164: string,
  ): Promise<OrgPhoneNumber | null> {
    const { data, error } = await this.db
      .from("org_phone_numbers")
      .select("*")
      .eq("phone_e164", phoneE164)
      .limit(1);
    if (error) {
      throw new Error(`membership: phone lookup failed: ${error.message}`);
    }
    const row = data?.[0];
    return row ? mapNumberRow(row) : null;
  }

  async insertOrgPhoneNumber(
    input: NewOrgPhoneNumber,
  ): Promise<OrgPhoneNumber> {
    const { data, error } = await this.db
      .from("org_phone_numbers")
      .insert({
        org_id: input.orgId,
        phone_e164: input.phoneE164,
        retell_number_ref: input.retellNumberRef,
        status: input.status,
        area_code: input.areaCode,
      })
      .select()
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new OrgNumberConflictError(input.orgId);
      }
      throw new Error(`membership: number insert failed: ${error.message}`);
    }
    if (!data) {
      throw new Error("membership: number insert returned no row");
    }
    return mapNumberRow(data);
  }

  async getCallSettings(orgId: string): Promise<OrgCallSettings | null> {
    const { data, error } = await this.db
      .from("org_call_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      throw new Error(`membership: settings lookup failed: ${error.message}`);
    }
    return data ? mapSettingsRow(data) : null;
  }

  async upsertCallSettings(
    orgId: string,
    patch: OrgCallSettingsPatch,
  ): Promise<OrgCallSettings> {
    const values: Row = { org_id: orgId };
    if (patch.callerIdentity !== undefined) {
      values.caller_identity = patch.callerIdentity;
    }
    if (patch.voicemailPolicy !== undefined) {
      values.voicemail_policy = patch.voicemailPolicy;
    }
    if (patch.transferNumber !== undefined) {
      values.transfer_number = patch.transferNumber;
    }
    const { data, error } = await this.db
      .from("org_call_settings")
      .upsert(values, { onConflict: "org_id" })
      .select()
      .single();
    if (error) {
      throw new Error(`membership: settings upsert failed: ${error.message}`);
    }
    if (!data) {
      throw new Error("membership: settings upsert returned no row");
    }
    return mapSettingsRow(data);
  }

  async getSubscription(orgId: string): Promise<OrgSubscriptionState> {
    const { data, error } = await this.db
      .from("subscriptions")
      .select("status, plan")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      throw new Error(
        `membership: subscription lookup failed: ${error.message}`,
      );
    }
    return {
      status: asString(data?.status ?? null),
      plan: asString(data?.plan ?? null),
    };
  }

  async getOrganization(orgId: string): Promise<OrgSummary | null> {
    const { data, error } = await this.db
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .maybeSingle();
    if (error) {
      throw new Error(`membership: org lookup failed: ${error.message}`);
    }
    return data ? { id: String(data.id), name: asString(data.name) } : null;
  }
}
