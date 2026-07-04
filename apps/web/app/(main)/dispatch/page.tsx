import React from "react";
import { DispatchFlow } from "@/components/dispatch/DispatchFlow";

/**
 * Dispatch flow entry (slice 8): plan review (Gate 1) + approve-and-dispatch
 * (Gate 2). Accepts ?caseId= to dispatch from a case with auto-attach.
 */
export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string }>;
}) {
  const { caseId } = await searchParams;
  return <DispatchFlow caseId={caseId} />;
}
