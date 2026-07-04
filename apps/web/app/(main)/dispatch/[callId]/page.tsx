import React from "react";
import { DispatchLiveView } from "@/components/dispatch/DispatchLiveView";

/** Live status, artifacts, retry, and attach-to-case for one dispatched call. */
export default async function DispatchCallPage({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const { callId } = await params;
  return <DispatchLiveView callId={callId} />;
}
