import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client
 *
 * This client uses the SERVICE_ROLE_KEY for backend operations, which bypasses
 * Row Level Security (RLS). Use with caution and ensure proper authorization
 * checks are implemented in your application logic.
 */

let supabaseAdmin: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient => {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables. Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }

  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdmin;
};

/**
 * Type-safe database access
 * Add your database types here for better TypeScript support
 */
export type Database = {
  public: {
    Tables: {
      // Example table structure - replace with your actual schema
      users: {
        Row: {
          id: string;
          email: string;
          name?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

// Export a typed client factory
export const getTypedSupabaseAdmin = () => {
  return getSupabaseAdmin() as SupabaseClient<Database>;
};
