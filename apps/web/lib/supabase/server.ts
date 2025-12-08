import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '../types/database';

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and Route Handlers
 * This client handles authentication via cookies automatically
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Support both naming conventions for the anon/publishable key
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check your .env.local file.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}
