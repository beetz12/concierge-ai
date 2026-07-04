/**
 * Demo mode server actions - return mock DB responses using UUIDs.
 * These replace Supabase calls when DEMO_MODE is true.
 */
import { randomUUID } from "crypto";

export async function createServiceRequestDemo(
  data: Record<string, unknown>,
) {
  return {
    id: randomUUID(),
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: "demo-user-000",
  };
}

export async function updateServiceRequestDemo(
  id: string,
  updates: Record<string, unknown>,
) {
  return { id, ...updates, updated_at: new Date().toISOString() };
}

export async function deleteServiceRequestDemo(id: string) {
  return { id };
}

export async function addProviderDemo(data: Record<string, unknown>) {
  return { id: randomUUID(), ...data, created_at: new Date().toISOString() };
}

export async function addProvidersDemo(providers: Record<string, unknown>[]) {
  return providers.map((p) => ({
    id: randomUUID(),
    ...p,
    created_at: new Date().toISOString(),
  }));
}

export async function addInteractionLogDemo(data: Record<string, unknown>) {
  return { id: randomUUID(), ...data, created_at: new Date().toISOString() };
}

export async function addInteractionLogsDemo(logs: Record<string, unknown>[]) {
  return logs.map((l) => ({
    id: randomUUID(),
    ...l,
    created_at: new Date().toISOString(),
  }));
}
