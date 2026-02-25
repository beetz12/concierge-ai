"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import { DEMO_MODE } from "../config/demo";
import { createClient } from "../supabase/client";
import type {
  SupabaseClient,
  User,
  Session,
  AuthError,
} from "@supabase/supabase-js";
import type { Database } from "../types/database";

// ============================================================================
// Types
// ============================================================================

interface AuthContextType {
  user: User | null;
  session: Session | null;
  supabase: SupabaseClient<Database>;
  isLoading: boolean;
  isAuthenticated: boolean;
  isVerified: boolean;
  error: AuthError | null;
}

interface AuthActionsContextType {
  signIn: (credentials: {
    email: string;
    password: string;
  }) => Promise<{ error: AuthError | null }>;
  signUp: (credentials: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  signInWithOAuth: (
    provider: "google" | "github" | "azure" | "linkedin_oidc"
  ) => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
}

// ============================================================================
// Contexts
// ============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(
  undefined
);

// ============================================================================
// Hooks
// ============================================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useAuthActions() {
  const context = useContext(AuthActionsContext);
  if (!context) {
    throw new Error("useAuthActions must be used within AuthProvider");
  }
  return context;
}

export function useUser() {
  const { user } = useAuth();
  return user;
}

export function useSession() {
  const { session, isLoading } = useAuth();
  return { session, isLoading };
}

export function useIsAuthenticated() {
  const { isAuthenticated, isLoading } = useAuth();
  return { isAuthenticated, isLoading };
}

export function useSupabaseClient() {
  const { supabase } = useAuth();
  return supabase;
}

// ============================================================================
// Provider
// ============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);

  // Derived state
  const isAuthenticated = !!session;
  const isVerified = !!session?.user?.email_confirmed_at;

  // Demo mode: auto-authenticate immediately
  useEffect(() => {
    if (!DEMO_MODE) return;
    setUser({
      id: "demo-user-000",
      email: "demo@concierge-ai.com",
      user_metadata: { display_name: "Demo User", first_name: "Demo", last_name: "User" },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as any);
    setSession({ access_token: "demo-token", user: {} } as any);
    setIsLoading(false);
  }, []);

  // Initialize session
  useEffect(() => {
    if (DEMO_MODE) return; // Skip real auth in demo mode

    let mounted = true;

    const initializeSession = async () => {
      try {
        const {
          data: { session: initialSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          setError(sessionError);
        } else {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
        }
      } catch (err) {
        console.error("Failed to get session:", err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // Start initialization with a small timeout to prevent blocking
    const timeoutId = setTimeout(() => {
      if (mounted) {
        setIsLoading(false);
      }
    }, 500);

    initializeSession().then(() => {
      clearTimeout(timeoutId);
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, newSession: any) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setError(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // ============================================================================
  // Auth Actions
  // ============================================================================

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      if (DEMO_MODE) return { error: null };
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: signInError };
    },
    [supabase]
  );

  const signUp = useCallback(
    async ({
      email,
      password,
      firstName,
      lastName,
    }: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    }) => {
      if (DEMO_MODE) return { error: null };
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            display_name:
              firstName && lastName ? `${firstName} ${lastName}` : undefined,
          },
        },
      });
      return { error: signUpError };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    if (DEMO_MODE) return { error: null };
    const { error: signOutError } = await supabase.auth.signOut();
    return { error: signOutError };
  }, [supabase]);

  const signInWithOAuth = useCallback(
    async (provider: "google" | "github" | "azure" | "linkedin_oidc") => {
      if (DEMO_MODE) return { error: null };
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      return { error: oauthError };
    },
    [supabase]
  );

  const resetPassword = useCallback(
    async (email: string) => {
      if (DEMO_MODE) return { error: null };
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }
      );
      return { error: resetError };
    },
    [supabase]
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (DEMO_MODE) return { error: null };
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      return { error: updateError };
    },
    [supabase]
  );

  // Memoize context values
  const authValue = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      supabase,
      isLoading,
      isAuthenticated,
      isVerified,
      error,
    }),
    [user, session, supabase, isLoading, isAuthenticated, isVerified, error]
  );

  const actionsValue = useMemo<AuthActionsContextType>(
    () => ({
      signIn,
      signUp,
      signOut,
      signInWithOAuth,
      resetPassword,
      updatePassword,
    }),
    [signIn, signUp, signOut, signInWithOAuth, resetPassword, updatePassword]
  );

  return (
    <AuthContext.Provider value={authValue}>
      <AuthActionsContext.Provider value={actionsValue}>
        {children}
      </AuthActionsContext.Provider>
    </AuthContext.Provider>
  );
}
