/**
 * Database query helpers for common operations
 * These functions can be used in both Server Components and Server Actions
 */

import { createClient as createServerClient } from "./server";
import type { Database, Tables } from "../types/database";

/**
 * Service Requests Queries
 */
export async function getServiceRequests(userId?: string) {
  const supabase = await createServerClient();

  let query = supabase
    .from("service_requests")
    .select(
      `
      *,
      providers!providers_request_id_fkey (*),
      interaction_logs (*)
    `,
    )
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

export async function getServiceRequestById(id: string) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("service_requests")
    .select(
      `
      *,
      providers!providers_request_id_fkey (*),
      interaction_logs (*)
    `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createServiceRequest(
  request: Database["public"]["Tables"]["service_requests"]["Insert"],
) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("service_requests")
    .insert(request)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateServiceRequest(
  id: string,
  updates: Database["public"]["Tables"]["service_requests"]["Update"],
) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("service_requests")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Providers Queries
 */
export async function addProvider(
  provider: Database["public"]["Tables"]["providers"]["Insert"],
) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("providers")
    .insert(provider)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getProvidersByRequestId(requestId: string) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Interaction Logs Queries
 */
export async function addInteractionLog(
  log: Database["public"]["Tables"]["interaction_logs"]["Insert"],
) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("interaction_logs")
    .insert(log)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getInteractionLogsByRequestId(requestId: string) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("interaction_logs")
    .select("*")
    .eq("request_id", requestId)
    .order("timestamp", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * User Queries
 */
export async function getCurrentUser() {
  const supabase = await createServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  return user;
}

export async function getUserById(id: string) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}
