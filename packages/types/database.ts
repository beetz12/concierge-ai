export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      call_authorizations: {
        Row: {
          approved_at: string
          call_plan_hash: string
          channel: string
          created_at: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          approved_at?: string
          call_plan_hash: string
          channel?: string
          created_at?: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          approved_at?: string
          call_plan_hash?: string
          channel?: string
          created_at?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_authorizations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_audit_log: {
        Row: {
          call_id: string | null
          channel: string
          created_at: string
          decision: string
          evaluated_at: string
          id: string
          org_id: string
          policy_version: string
          reasons: string[]
          target_number: string | null
          task_type: string | null
        }
        Insert: {
          call_id?: string | null
          channel?: string
          created_at?: string
          decision: string
          evaluated_at?: string
          id?: string
          org_id: string
          policy_version: string
          reasons?: string[]
          target_number?: string | null
          task_type?: string | null
        }
        Update: {
          call_id?: string | null
          channel?: string
          created_at?: string
          decision?: string
          evaluated_at?: string
          id?: string
          org_id?: string
          policy_version?: string
          reasons?: string[]
          target_number?: string | null
          task_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_logs: {
        Row: {
          call_id: string | null
          created_at: string
          detail: string
          id: string
          org_id: string
          request_id: string
          status: Database["public"]["Enums"]["log_status"]
          step_name: string
          timestamp: string
          transcript: Json | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          detail: string
          id?: string
          org_id?: string
          request_id: string
          status: Database["public"]["Enums"]["log_status"]
          step_name: string
          timestamp?: string
          transcript?: Json | null
        }
        Update: {
          call_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          org_id?: string
          request_id?: string
          status?: Database["public"]["Enums"]["log_status"]
          step_name?: string
          timestamp?: string
          transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "interaction_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          address: string | null
          booking_confirmed: boolean | null
          booking_date: string | null
          booking_time: string | null
          call_cost: number | null
          call_duration_minutes: number | null
          call_id: string | null
          call_method: string | null
          call_result: Json | null
          call_status: string | null
          call_summary: string | null
          call_transcript: string | null
          called_at: string | null
          confirmation_number: string | null
          created_at: string
          distance: number | null
          distance_text: string | null
          google_maps_uri: string | null
          hours_of_operation: Json | null
          id: string
          international_phone: string | null
          is_open_now: boolean | null
          last_call_at: string | null
          name: string
          org_id: string
          phone: string | null
          place_id: string | null
          provider_intel: Json | null
          rating: number | null
          request_id: string
          review_count: number | null
          source: Database["public"]["Enums"]["provider_source"] | null
          website: string | null
        }
        Insert: {
          address?: string | null
          booking_confirmed?: boolean | null
          booking_date?: string | null
          booking_time?: string | null
          call_cost?: number | null
          call_duration_minutes?: number | null
          call_id?: string | null
          call_method?: string | null
          call_result?: Json | null
          call_status?: string | null
          call_summary?: string | null
          call_transcript?: string | null
          called_at?: string | null
          confirmation_number?: string | null
          created_at?: string
          distance?: number | null
          distance_text?: string | null
          google_maps_uri?: string | null
          hours_of_operation?: Json | null
          id?: string
          international_phone?: string | null
          is_open_now?: boolean | null
          last_call_at?: string | null
          name: string
          org_id?: string
          phone?: string | null
          place_id?: string | null
          provider_intel?: Json | null
          rating?: number | null
          request_id: string
          review_count?: number | null
          source?: Database["public"]["Enums"]["provider_source"] | null
          website?: string | null
        }
        Update: {
          address?: string | null
          booking_confirmed?: boolean | null
          booking_date?: string | null
          booking_time?: string | null
          call_cost?: number | null
          call_duration_minutes?: number | null
          call_id?: string | null
          call_method?: string | null
          call_result?: Json | null
          call_status?: string | null
          call_summary?: string | null
          call_transcript?: string | null
          called_at?: string | null
          confirmation_number?: string | null
          created_at?: string
          distance?: number | null
          distance_text?: string | null
          google_maps_uri?: string | null
          hours_of_operation?: Json | null
          id?: string
          international_phone?: string | null
          is_open_now?: boolean | null
          last_call_at?: string | null
          name?: string
          org_id?: string
          phone?: string | null
          place_id?: string | null
          provider_intel?: Json | null
          rating?: number | null
          request_id?: string
          review_count?: number | null
          source?: Database["public"]["Enums"]["provider_source"] | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          created_at: string
          criteria: string
          description: string
          direct_contact_info: Json | null
          final_outcome: string | null
          id: string
          location: string | null
          notification_method: string | null
          notification_sent_at: string | null
          org_id: string
          preferred_contact: string | null
          recommendations: Json | null
          selected_provider_id: string | null
          sms_message_sid: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          type: Database["public"]["Enums"]["request_type"]
          updated_at: string
          user_id: string | null
          user_phone: string | null
          user_selection: number | null
        }
        Insert: {
          created_at?: string
          criteria: string
          description: string
          direct_contact_info?: Json | null
          final_outcome?: string | null
          id?: string
          location?: string | null
          notification_method?: string | null
          notification_sent_at?: string | null
          org_id?: string
          preferred_contact?: string | null
          recommendations?: Json | null
          selected_provider_id?: string | null
          sms_message_sid?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          type: Database["public"]["Enums"]["request_type"]
          updated_at?: string
          user_id?: string | null
          user_phone?: string | null
          user_selection?: number | null
        }
        Update: {
          created_at?: string
          criteria?: string
          description?: string
          direct_contact_info?: Json | null
          final_outcome?: string | null
          id?: string
          location?: string | null
          notification_method?: string | null
          notification_sent_at?: string | null
          org_id?: string
          preferred_contact?: string | null
          recommendations?: Json | null
          selected_provider_id?: string | null
          sms_message_sid?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          type?: Database["public"]["Enums"]["request_type"]
          updated_at?: string
          user_id?: string | null
          user_phone?: string | null
          user_selection?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_selected_provider_id_fkey"
            columns: ["selected_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          id: string
          org_id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_entries: {
        Row: {
          added_at: string
          created_at: string
          expires_at: string | null
          id: string
          org_id: string | null
          phone_number: string
          reason: string
          source_call_id: string | null
        }
        Insert: {
          added_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id?: string | null
          phone_number: string
          reason?: string
          source_call_id?: string | null
        }
        Update: {
          added_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id?: string | null
          phone_number?: string
          reason?: string
          source_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppression_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          callback_number: string | null
          caller_display_name: string | null
          created_at: string
          default_voicemail_policy: string
          disclosure_config: Json
          from_number: string | null
          org_id: string
          outbound_kill_switch: boolean
          updated_at: string
        }
        Insert: {
          callback_number?: string | null
          caller_display_name?: string | null
          created_at?: string
          default_voicemail_policy?: string
          disclosure_config?: Json
          from_number?: string | null
          org_id: string
          outbound_kill_switch?: boolean
          updated_at?: string
        }
        Update: {
          callback_number?: string | null
          caller_display_name?: string | null
          created_at?: string
          default_voicemail_policy?: string
          disclosure_config?: Json
          from_number?: string | null
          org_id?: string
          outbound_kill_switch?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          call_id: string | null
          created_at: string
          id: string
          occurred_at: string
          org_id: string
          quantity: number
          type: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          org_id: string
          quantity: number
          type: string
        }
        Update: {
          call_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          org_id?: string
          quantity?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      voice_call_events: {
        Row: {
          agent_role: string | null
          created_at: string
          event_type: string
          id: string
          org_id: string
          payload: Json
          provider_id: string
          service_request_id: string
          session_id: string
        }
        Insert: {
          agent_role?: string | null
          created_at?: string
          event_type: string
          id?: string
          org_id?: string
          payload?: Json
          provider_id: string
          service_request_id: string
          session_id: string
        }
        Update: {
          agent_role?: string | null
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json
          provider_id?: string
          service_request_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_call_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_call_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "voice_call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_call_sessions: {
        Row: {
          active_agent: string
          closed_at: string | null
          id: string
          metadata: Json
          org_id: string
          outcome: Json | null
          provider_id: string
          runtime_provider: string
          service_request_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          active_agent: string
          closed_at?: string | null
          id: string
          metadata?: Json
          org_id?: string
          outcome?: Json | null
          provider_id: string
          runtime_provider: string
          service_request_id: string
          started_at?: string
          status: string
          updated_at?: string
        }
        Update: {
          active_agent?: string
          closed_at?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          outcome?: Json | null
          provider_id?: string
          runtime_provider?: string
          service_request_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_call_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization: {
        Args: { org_name: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_org_role: {
        Args: { allowed_roles: string[]; target_org_id: string }
        Returns: boolean
      }
      is_org_member: { Args: { target_org_id: string }; Returns: boolean }
    }
    Enums: {
      log_status: "success" | "warning" | "error" | "info"
      provider_source: "Google Maps" | "User Input"
      request_status:
        | "PENDING"
        | "SEARCHING"
        | "CALLING"
        | "ANALYZING"
        | "RECOMMENDED"
        | "BOOKING"
        | "COMPLETED"
        | "FAILED"
      request_type: "RESEARCH_AND_BOOK" | "DIRECT_TASK"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      log_status: ["success", "warning", "error", "info"],
      provider_source: ["Google Maps", "User Input"],
      request_status: [
        "PENDING",
        "SEARCHING",
        "CALLING",
        "ANALYZING",
        "RECOMMENDED",
        "BOOKING",
        "COMPLETED",
        "FAILED",
      ],
      request_type: ["RESEARCH_AND_BOOK", "DIRECT_TASK"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

