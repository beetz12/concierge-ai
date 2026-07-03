"use server";

/**
 * Server Actions for organization membership and onboarding.
 *
 * All queries run as the signed-in user (anon-key client + session cookies),
 * so RLS on organizations/organization_members does the authorization.
 */

import { createClient } from "../supabase/server";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export interface OrganizationMembership {
  orgId: string;
  name: string;
  role: "owner" | "admin" | "member";
}

const DEMO_MEMBERSHIP: OrganizationMembership = {
  orgId: "demo-org-000",
  name: "Demo Organization",
  role: "owner",
};

/**
 * List the current user's organizations (empty when signed out).
 */
export async function getUserOrganizations(): Promise<OrganizationMembership[]> {
  if (DEMO_MODE) return [DEMO_MEMBERSHIP];
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, role, organizations(name)")
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Failed to load organizations: ${error.message}`);
  }

  type MembershipRow = {
    org_id: string;
    role: string;
    organizations: { name: string } | null;
  };

  return ((data ?? []) as MembershipRow[]).map((row) => ({
    orgId: row.org_id,
    role: row.role as OrganizationMembership["role"],
    name: row.organizations?.name ?? "Unnamed organization",
  }));
}

/**
 * Ensure the current user belongs to at least one organization, creating a
 * personal org on first sign-in. Idempotent; returns the memberships.
 */
export async function ensureOrganization(): Promise<OrganizationMembership[]> {
  if (DEMO_MODE) return [DEMO_MEMBERSHIP];
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const existing = await getUserOrganizations();
  if (existing.length > 0) return existing;

  const orgName = user.email ? `${user.email.split("@")[0]}'s team` : "My team";
  const { data: org, error } = await supabase.rpc("create_organization", {
    org_name: orgName,
  });

  if (error) {
    throw new Error(`Failed to create organization: ${error.message}`);
  }

  return [{ orgId: org.id, name: org.name, role: "owner" }];
}

/**
 * Resolve the org id to attribute new tenant rows to: first membership,
 * creating the personal org when needed.
 */
export async function getActiveOrgId(): Promise<string | null> {
  const memberships = await ensureOrganization();
  return memberships[0]?.orgId ?? null;
}
