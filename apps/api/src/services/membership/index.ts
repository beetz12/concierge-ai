/**
 * Membership store factory: in-memory singleton in DEMO_MODE (no Supabase),
 * Supabase-backed otherwise.
 */
import { isDemoMode } from "../../config/demo.js";
import { getDemoMembershipStore } from "./memory-store.js";
import {
  SupabaseMembershipStore,
  type MembershipDbClient,
} from "./supabase-store.js";
import type { MembershipStore } from "./types.js";

export * from "./types.js";
export {
  InMemoryMembershipStore,
  getDemoMembershipStore,
} from "./memory-store.js";
export {
  SupabaseMembershipStore,
  type MembershipDbClient,
} from "./supabase-store.js";

export function getMembershipStore(supabase: unknown): MembershipStore {
  if (isDemoMode()) {
    return getDemoMembershipStore();
  }
  return new SupabaseMembershipStore(supabase as MembershipDbClient);
}
