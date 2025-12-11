/**
 * Database schema types for Supabase
 *
 * This file contains TypeScript types that map to your Supabase database schema.
 * These types can be auto-generated using the Supabase CLI:
 *
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/types/database.ts
 *
 * For now, we'll define types based on the existing application models.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RequestStatus =
  | "PENDING"
  | "SEARCHING"
  | "CALLING"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED";

export type RequestType = "RESEARCH_AND_BOOK" | "DIRECT_TASK";

export interface Database {
  public: {
    Tables: {
      service_requests: {
        Row: {
          id: string;
          user_id: string | null;
          type: RequestType;
          title: string;
          description: string;
          criteria: string;
          location: string | null;
          status: RequestStatus;
          created_at: string;
          updated_at: string;
          selected_provider_id: string | null;
          final_outcome: string | null;
          direct_contact_info: Json | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          type: RequestType;
          title: string;
          description: string;
          criteria: string;
          location?: string | null;
          status?: RequestStatus;
          created_at?: string;
          updated_at?: string;
          selected_provider_id?: string | null;
          final_outcome?: string | null;
          direct_contact_info?: Json | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          type?: RequestType;
          title?: string;
          description?: string;
          criteria?: string;
          location?: string | null;
          status?: RequestStatus;
          created_at?: string;
          updated_at?: string;
          selected_provider_id?: string | null;
          final_outcome?: string | null;
          direct_contact_info?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_requests_selected_provider_id_fkey";
            columns: ["selected_provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      providers: {
        Row: {
          id: string;
          request_id: string;
          name: string;
          phone: string | null;
          rating: number | null;
          address: string | null;
          source: "Google Maps" | "User Input" | null;
          created_at: string;
          // Call tracking columns (from migration 20250108)
          call_status: string | null;
          call_result: Json | null;
          call_transcript: string | null;
          call_summary: string | null;
          call_duration_minutes: number | null;
          call_cost: number | null;
          call_method: string | null;
          call_id: string | null;
          called_at: string | null;
          // Google Places / Research columns (from migration 20250109)
          place_id: string | null;
          review_count: number | null;
          distance: number | null;
          distance_text: string | null;
          hours_of_operation: Json | null;
          is_open_now: boolean | null;
          google_maps_uri: string | null;
          website: string | null;
          international_phone: string | null;
        };
        Insert: {
          id?: string;
          request_id: string;
          name: string;
          phone?: string | null;
          rating?: number | null;
          address?: string | null;
          source?: "Google Maps" | "User Input" | null;
          created_at?: string;
          // Call tracking columns
          call_status?: string | null;
          call_result?: Json | null;
          call_transcript?: string | null;
          call_summary?: string | null;
          call_duration_minutes?: number | null;
          call_cost?: number | null;
          call_method?: string | null;
          call_id?: string | null;
          called_at?: string | null;
          // Google Places / Research columns
          place_id?: string | null;
          review_count?: number | null;
          distance?: number | null;
          distance_text?: string | null;
          hours_of_operation?: Json | null;
          is_open_now?: boolean | null;
          google_maps_uri?: string | null;
          website?: string | null;
          international_phone?: string | null;
        };
        Update: {
          id?: string;
          request_id?: string;
          name?: string;
          phone?: string | null;
          rating?: number | null;
          address?: string | null;
          source?: "Google Maps" | "User Input" | null;
          created_at?: string;
          // Call tracking columns
          call_status?: string | null;
          call_result?: Json | null;
          call_transcript?: string | null;
          call_summary?: string | null;
          call_duration_minutes?: number | null;
          call_cost?: number | null;
          call_method?: string | null;
          call_id?: string | null;
          called_at?: string | null;
          // Google Places / Research columns
          place_id?: string | null;
          review_count?: number | null;
          distance?: number | null;
          distance_text?: string | null;
          hours_of_operation?: Json | null;
          is_open_now?: boolean | null;
          google_maps_uri?: string | null;
          website?: string | null;
          international_phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "providers_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      interaction_logs: {
        Row: {
          id: string;
          request_id: string;
          timestamp: string;
          step_name: string;
          detail: string;
          transcript: Json | null;
          status: "success" | "warning" | "error" | "info";
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          timestamp?: string;
          step_name: string;
          detail: string;
          transcript?: Json | null;
          status: "success" | "warning" | "error" | "info";
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          timestamp?: string;
          step_name?: string;
          detail?: string;
          transcript?: Json | null;
          status?: "success" | "warning" | "error" | "info";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interaction_logs_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      request_status: RequestStatus;
      request_type: RequestType;
      provider_source: "Google Maps" | "User Input";
      log_status: "success" | "warning" | "error" | "info";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Type helpers for easier use throughout the application
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
