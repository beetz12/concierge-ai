import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../types/database";

/**
 * Creates a Supabase client for use in Client Components
 * This client is used for client-side interactions and real-time subscriptions
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Support both naming conventions for the anon/publishable key
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      // In demo mode, return a mock browser client
      return {
        from: () => ({
          select: () => ({ data: [], error: null, single: () => ({ data: null, error: null }) }),
          insert: () => ({ select: () => ({ data: [], error: null, single: () => ({ data: null, error: null }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ data: null, error: null, single: () => ({ data: null, error: null }) }) }) }),
          delete: () => ({ eq: () => ({ data: null, error: null }) }),
        }),
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
          signUp: async () => ({ data: { session: null, user: null }, error: null }),
          signOut: async () => ({ error: null }),
          signInWithOAuth: async () => ({ data: { provider: "", url: "" }, error: null }),
          resetPasswordForEmail: async () => ({ data: {}, error: null }),
          updateUser: async () => ({ data: { user: null }, error: null }),
        },
        channel: () => ({
          on: () => ({ subscribe: () => ({}) }),
        }),
        removeChannel: () => {},
      } as any;
    }
    throw new Error(
      "Missing Supabase environment variables. Please check your .env.local file.",
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
