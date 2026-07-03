"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import {
  getUserOrganizations,
  type OrganizationMembership,
} from "@/lib/actions/organizations";

const ACTIVE_ORG_KEY = "concierge-active-org-id";

/**
 * Org switcher stub: lists the user's organizations and remembers the pick
 * in localStorage. Data flows are still single-org (first membership); a
 * future slice threads the selection through queries and API calls.
 */
export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<OrganizationMembership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUserOrganizations()
      .then((memberships) => {
        if (cancelled) return;
        setOrgs(memberships);
        const stored = window.localStorage.getItem(ACTIVE_ORG_KEY);
        const valid = memberships.find((m) => m.orgId === stored);
        setActiveOrgId(valid?.orgId ?? memberships[0]?.orgId ?? null);
      })
      .catch(() => {
        // Signed out or RLS-denied; render nothing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (orgs.length === 0) return null;

  const handleChange = (orgId: string) => {
    setActiveOrgId(orgId);
    window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-highlight/50 px-2 py-1.5">
      <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
      <select
        value={activeOrgId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full bg-transparent text-sm text-slate-200 outline-none cursor-pointer"
        aria-label="Active organization"
      >
        {orgs.map((org) => (
          <option key={org.orgId} value={org.orgId} className="bg-surface">
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
}
