"use server";

/**
 * Server Actions for managing service requests
 * These functions can be called directly from Client Components
 */

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import type { Database } from "../types/database";
import {
  createServiceRequestDemo,
  updateServiceRequestDemo,
  deleteServiceRequestDemo,
  addProviderDemo,
  addProvidersDemo,
  addInteractionLogDemo,
  addInteractionLogsDemo,
} from "./demo-actions";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

type ServiceRequestInsert =
  Database["public"]["Tables"]["service_requests"]["Insert"];
type ServiceRequestUpdate =
  Database["public"]["Tables"]["service_requests"]["Update"];
type ProviderInsert = Database["public"]["Tables"]["providers"]["Insert"];
type InteractionLogInsert =
  Database["public"]["Tables"]["interaction_logs"]["Insert"];

/**
 * Create a new service request
 */
export async function createServiceRequest(data: ServiceRequestInsert) {
  if (DEMO_MODE) return createServiceRequestDemo(data);
  const supabase = await createClient();

  const { data: request, error } = await supabase
    .from("service_requests")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create service request: ${error.message}`);
  }

  revalidatePath("/requests");
  return request;
}

/**
 * Update an existing service request
 */
export async function updateServiceRequest(
  id: string,
  updates: ServiceRequestUpdate,
) {
  if (DEMO_MODE) return updateServiceRequestDemo(id, updates);
  const supabase = await createClient();

  const { data: request, error } = await supabase
    .from("service_requests")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update service request: ${error.message}`);
  }

  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
  return request;
}

/**
 * Delete a service request
 */
export async function deleteServiceRequest(id: string) {
  if (DEMO_MODE) return deleteServiceRequestDemo(id);
  const supabase = await createClient();

  const { error } = await supabase
    .from("service_requests")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete service request: ${error.message}`);
  }

  revalidatePath("/requests");
}

/**
 * Add a provider to a service request
 */
export async function addProvider(data: ProviderInsert) {
  if (DEMO_MODE) return addProviderDemo(data);
  const supabase = await createClient();

  const { data: provider, error } = await supabase
    .from("providers")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add provider: ${error.message}`);
  }

  revalidatePath("/requests");
  revalidatePath(`/requests/${data.request_id}`);
  return provider;
}

/**
 * Add multiple providers to a service request
 */
export async function addProviders(providers: ProviderInsert[]) {
  if (DEMO_MODE) return addProvidersDemo(providers);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("providers")
    .insert(providers)
    .select();

  if (error) {
    throw new Error(`Failed to add providers: ${error.message}`);
  }

  const firstProvider = providers[0];
  if (firstProvider) {
    revalidatePath("/requests");
    revalidatePath(`/requests/${firstProvider.request_id}`);
  }

  return data;
}

/**
 * Add an interaction log to a service request
 */
export async function addInteractionLog(data: InteractionLogInsert) {
  if (DEMO_MODE) return addInteractionLogDemo(data);
  const supabase = await createClient();

  const { data: log, error } = await supabase
    .from("interaction_logs")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add interaction log: ${error.message}`);
  }

  revalidatePath("/requests");
  revalidatePath(`/requests/${data.request_id}`);
  return log;
}

/**
 * Add multiple interaction logs to a service request
 */
export async function addInteractionLogs(logs: InteractionLogInsert[]) {
  if (DEMO_MODE) return addInteractionLogsDemo(logs);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interaction_logs")
    .insert(logs)
    .select();

  if (error) {
    throw new Error(`Failed to add interaction logs: ${error.message}`);
  }

  const firstLog = logs[0];
  if (firstLog) {
    revalidatePath("/requests");
    revalidatePath(`/requests/${firstLog.request_id}`);
  }

  return data;
}

/**
 * Update service request status
 */
export async function updateRequestStatus(
  id: string,
  status: Database["public"]["Enums"]["request_status"],
) {
  return updateServiceRequest(id, { status });
}

/**
 * Set the selected provider for a service request
 */
export async function selectProvider(requestId: string, providerId: string) {
  return updateServiceRequest(requestId, { selected_provider_id: providerId });
}

/**
 * Set the final outcome for a service request
 */
export async function setFinalOutcome(requestId: string, outcome: string) {
  return updateServiceRequest(requestId, {
    final_outcome: outcome,
    status: "COMPLETED",
  });
}
