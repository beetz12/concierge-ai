/**
 * In-memory {@link MembershipStore} used in DEMO_MODE (no Supabase) and by
 * unit tests. Process-local by design, mirroring the demo cases store.
 */
import { randomUUID } from "node:crypto";
import {
  OrgNumberConflictError,
  type MembershipStore,
  type NewOrgPhoneNumber,
  type OrgCallSettings,
  type OrgCallSettingsPatch,
  type OrgPhoneNumber,
  type OrgSubscriptionState,
  type OrgSummary,
} from "./types.js";

export class InMemoryMembershipStore implements MembershipStore {
  private readonly numbers = new Map<string, OrgPhoneNumber>();
  private readonly settings = new Map<string, OrgCallSettings>();
  private readonly subscriptions = new Map<string, OrgSubscriptionState>();
  private readonly organizations = new Map<string, OrgSummary>();

  async getOrgPhoneNumber(orgId: string): Promise<OrgPhoneNumber | null> {
    return this.numbers.get(orgId) ?? null;
  }

  async findOrgPhoneNumberByPhone(
    phoneE164: string,
  ): Promise<OrgPhoneNumber | null> {
    for (const number of this.numbers.values()) {
      if (number.phoneE164 === phoneE164) return number;
    }
    return null;
  }

  async insertOrgPhoneNumber(
    input: NewOrgPhoneNumber,
  ): Promise<OrgPhoneNumber> {
    if (this.numbers.has(input.orgId)) {
      throw new OrgNumberConflictError(input.orgId);
    }
    const row: OrgPhoneNumber = {
      id: randomUUID(),
      orgId: input.orgId,
      phoneE164: input.phoneE164,
      retellNumberRef: input.retellNumberRef,
      status: input.status,
      areaCode: input.areaCode,
      purchasedAt: new Date().toISOString(),
      releasedAt: null,
    };
    this.numbers.set(input.orgId, row);
    return row;
  }

  async getCallSettings(orgId: string): Promise<OrgCallSettings | null> {
    return this.settings.get(orgId) ?? null;
  }

  async upsertCallSettings(
    orgId: string,
    patch: OrgCallSettingsPatch,
  ): Promise<OrgCallSettings> {
    const existing = this.settings.get(orgId);
    const next: OrgCallSettings = {
      orgId,
      callerIdentity:
        patch.callerIdentity !== undefined
          ? patch.callerIdentity
          : (existing?.callerIdentity ?? null),
      voicemailPolicy:
        patch.voicemailPolicy ?? existing?.voicemailPolicy ?? "hang_up",
      transferNumber:
        patch.transferNumber !== undefined
          ? patch.transferNumber
          : (existing?.transferNumber ?? null),
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(orgId, next);
    return next;
  }

  async getSubscription(orgId: string): Promise<OrgSubscriptionState> {
    return this.subscriptions.get(orgId) ?? { status: null, plan: null };
  }

  async getOrganization(orgId: string): Promise<OrgSummary | null> {
    return this.organizations.get(orgId) ?? null;
  }

  // -- Test / demo seeding helpers (not part of MembershipStore) ------------

  setSubscription(orgId: string, state: OrgSubscriptionState): void {
    this.subscriptions.set(orgId, state);
  }

  setOrganization(org: OrgSummary): void {
    this.organizations.set(org.id, org);
  }

  reset(): void {
    this.numbers.clear();
    this.settings.clear();
    this.subscriptions.clear();
    this.organizations.clear();
  }
}

let demoStore: InMemoryMembershipStore | null = null;

/** Singleton in-memory store shared across routes in DEMO_MODE. */
export function getDemoMembershipStore(): InMemoryMembershipStore {
  demoStore ??= new InMemoryMembershipStore();
  return demoStore;
}
