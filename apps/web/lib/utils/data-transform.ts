/**
 * Utility functions to transform data between localStorage format and Supabase database format
 */

import type { ServiceRequest, Provider, InteractionLog } from "../types";
import { safeRequestStatus } from "../types";
import type { Database } from "../types/database";

type DbServiceRequest = Database["public"]["Tables"]["service_requests"]["Row"];
type DbProvider = Database["public"]["Tables"]["providers"]["Row"];
type DbInteractionLog = Database["public"]["Tables"]["interaction_logs"]["Row"];

/**
 * Transform localStorage ServiceRequest to database format
 */
export function transformToDbRequest(
  request: ServiceRequest,
): Database["public"]["Tables"]["service_requests"]["Insert"] {
  return {
    id: request.id,
    type: request.type,
    title: request.title,
    description: request.description,
    criteria: request.criteria,
    location: request.location || null,
    status: request.status as Database["public"]["Enums"]["request_status"],
    created_at: request.createdAt,
    final_outcome: request.finalOutcome || null,
    direct_contact_info: request.directContactInfo
      ? JSON.parse(JSON.stringify(request.directContactInfo))
      : null,
  };
}

/**
 * Transform localStorage Provider to database format
 */
export function transformToDbProvider(
  provider: Provider,
  requestId: string,
): Database["public"]["Tables"]["providers"]["Insert"] {
  return {
    id: provider.id,
    request_id: requestId,
    name: provider.name,
    phone: provider.phone || null,
    rating: provider.rating || null,
    address: provider.address || null,
    source: provider.source || null,
  };
}

/**
 * Transform localStorage InteractionLog to database format
 */
export function transformToDbLog(
  log: InteractionLog,
  requestId: string,
): Database["public"]["Tables"]["interaction_logs"]["Insert"] {
  return {
    request_id: requestId,
    timestamp: log.timestamp,
    step_name: log.stepName,
    detail: log.detail,
    transcript: log.transcript
      ? JSON.parse(JSON.stringify(log.transcript))
      : null,
    status: log.status,
  };
}

/**
 * Transform database ServiceRequest to localStorage format
 */
export function transformFromDbRequest(
  dbRequest: DbServiceRequest & {
    providers?: DbProvider[];
    interaction_logs?: DbInteractionLog[];
  },
): ServiceRequest {
  return {
    id: dbRequest.id,
    type: dbRequest.type as ServiceRequest["type"],
    title: dbRequest.title,
    description: dbRequest.description,
    criteria: dbRequest.criteria,
    location: dbRequest.location || undefined,
    status: safeRequestStatus(dbRequest.status),
    createdAt: dbRequest.created_at,
    providersFound: dbRequest.providers
      ? dbRequest.providers.map(transformFromDbProvider)
      : [],
    interactions: dbRequest.interaction_logs
      ? dbRequest.interaction_logs.map(transformFromDbLog)
      : [],
    selectedProvider: null, // Would need to fetch separately
    finalOutcome: dbRequest.final_outcome || undefined,
    directContactInfo: dbRequest.direct_contact_info
      ? (dbRequest.direct_contact_info as { name: string; phone: string })
      : undefined,
  };
}

/**
 * Transform database Provider to localStorage format
 */
export function transformFromDbProvider(dbProvider: DbProvider): Provider {
  return {
    id: dbProvider.id,
    name: dbProvider.name,
    phone: dbProvider.phone || undefined,
    rating: dbProvider.rating ? Number(dbProvider.rating) : undefined,
    address: dbProvider.address || undefined,
    source: dbProvider.source || undefined,
  };
}

/**
 * Transform database InteractionLog to localStorage format
 */
export function transformFromDbLog(dbLog: DbInteractionLog): InteractionLog {
  return {
    timestamp: dbLog.timestamp,
    stepName: dbLog.step_name,
    detail: dbLog.detail,
    transcript: dbLog.transcript
      ? (dbLog.transcript as { speaker: string; text: string }[])
      : undefined,
    status: dbLog.status,
  };
}
