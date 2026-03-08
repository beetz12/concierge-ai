"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

interface UseRequireAuthOptions {
  redirectTo?: string;
}

interface UseRequireAuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: ReturnType<typeof useAuth>["user"];
  isReady: boolean;
}

/**
 * Hook to require authentication on a page.
 * Redirects to login if not authenticated.
 *
 * Note: Actual redirects are handled by middleware for SSR.
 * This hook provides client-side state for conditional rendering.
 */
export function useRequireAuth(
  options: UseRequireAuthOptions = {}
): UseRequireAuthResult {
  const { redirectTo = "/login" } = options;
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      const currentPath = window.location.pathname;
      const redirectUrl = `${redirectTo}?redirectTo=${encodeURIComponent(currentPath)}`;
      router.replace(redirectUrl);
    } else {
      setIsReady(true);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  return {
    isAuthenticated,
    isLoading,
    user,
    isReady,
  };
}

interface UseRequireEmailVerificationOptions {
  redirectTo?: string;
}

interface UseRequireEmailVerificationResult {
  isVerified: boolean;
  isLoading: boolean;
  user: ReturnType<typeof useAuth>["user"];
  needsVerification: boolean;
  isReady: boolean;
}

/**
 * Hook to require email verification.
 * Redirects unverified users to verification page.
 */
export function useRequireEmailVerification(
  options: UseRequireEmailVerificationOptions = {}
): UseRequireEmailVerificationResult {
  const { redirectTo = "/auth/verify-email" } = options;
  const { isAuthenticated, isVerified, isLoading, user } = useAuth();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  const needsVerification = isAuthenticated && !isVerified;

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/login");
    } else if (!isVerified) {
      router.replace(redirectTo);
    } else {
      setIsReady(true);
    }
  }, [isAuthenticated, isVerified, isLoading, redirectTo, router]);

  return {
    isVerified,
    isLoading,
    user,
    needsVerification,
    isReady,
  };
}

interface UseRedirectIfAuthenticatedOptions {
  defaultRedirect?: string;
}

/**
 * Hook to redirect authenticated users away from public pages (login, register).
 * Reads optional ?redirectTo query param for custom redirect.
 */
export function useRedirectIfAuthenticated(
  options: UseRedirectIfAuthenticatedOptions = {}
): { isLoading: boolean; isReady: boolean } {
  const { defaultRedirect = "/dashboard" } = options;
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      const redirectTo =
        new URLSearchParams(window.location.search).get("redirectTo") ||
        defaultRedirect;
      router.replace(redirectTo);
    } else {
      setIsReady(true);
    }
  }, [isAuthenticated, isLoading, defaultRedirect, router]);

  return {
    isLoading,
    isReady,
  };
}

interface AuthRedirectConfig {
  authenticated?: string;
  unauthenticated?: string;
  unverified?: string;
}

/**
 * Flexible hook for handling various auth redirect scenarios.
 */
export function useAuthRedirect(config: AuthRedirectConfig = {}): {
  isLoading: boolean;
  isReady: boolean;
} {
  const { authenticated, unauthenticated, unverified } = config;
  const { isAuthenticated, isVerified, isLoading } = useAuth();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && authenticated) {
      router.replace(authenticated);
      return;
    }

    if (!isAuthenticated && unauthenticated) {
      router.replace(unauthenticated);
      return;
    }

    if (isAuthenticated && !isVerified && unverified) {
      router.replace(unverified);
      return;
    }

    setIsReady(true);
  }, [
    isAuthenticated,
    isVerified,
    isLoading,
    authenticated,
    unauthenticated,
    unverified,
    router,
  ]);

  return {
    isLoading,
    isReady,
  };
}
