"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";
import type { Tables } from "../types/database";

export type ServiceRequestWithRelations = Tables<"service_requests"> & {
  providers?: Tables<"providers">[];
  interaction_logs?: Tables<"interaction_logs">[];
};

/**
 * Hook to fetch and subscribe to service requests in real-time
 * @param userId - Optional user ID to filter requests
 * @returns Service requests, loading state, and error
 */
export function useServiceRequests(userId?: string) {
  const [requests, setRequests] = useState<ServiceRequestWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Fetch initial data
    const fetchRequests = async () => {
      try {
        let query = supabase
          .from("service_requests")
          .select(
            `
            *,
            providers (*),
            interaction_logs (*)
          `,
          )
          .order("created_at", { ascending: false });

        if (userId) {
          query = query.eq("user_id", userId);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        // Transform the data to ensure arrays for relations
        const transformedData: ServiceRequestWithRelations[] = (data || []).map(
          (item) => ({
            ...item,
            providers: Array.isArray(item.providers)
              ? item.providers
              : item.providers
                ? [item.providers]
                : [],
            interaction_logs: Array.isArray(item.interaction_logs)
              ? item.interaction_logs
              : item.interaction_logs
                ? [item.interaction_logs]
                : [],
          }),
        );
        setRequests(transformedData);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();

    // Subscribe to real-time changes
    const channel = supabase
      .channel("service_requests_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRequests((prev) => [
              payload.new as ServiceRequestWithRelations,
              ...prev,
            ]);
          } else if (payload.eventType === "UPDATE") {
            setRequests((prev) =>
              prev.map((req) =>
                req.id === payload.new.id ? { ...req, ...payload.new } : req,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setRequests((prev) =>
              prev.filter((req) => req.id !== payload.old.id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { requests, loading, error };
}
