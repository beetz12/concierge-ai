import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

// Routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/new", "/direct", "/history", "/request"];

// Routes that should redirect authenticated users
const AUTH_ROUTES = ["/login", "/register"];

// Routes that should always be public
const PUBLIC_ROUTES = ["/", "/about", "/auth/callback", "/auth/verify-email"];

export async function middleware(request: NextRequest) {
  // In demo mode, skip all auth checks
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.next();
  }

  // Update the session (refresh tokens if needed)
  const response = await updateSession(request);

  const { pathname } = request.nextUrl;

  // Check if the route is protected
  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Check if the route is an auth route (login/register)
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Check if the route is public
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Get the user from the session (already fetched in updateSession)
  // We need to check the cookies to determine auth state
  const supabaseAuthCookie = request.cookies
    .getAll()
    .find((cookie) => cookie.name.includes("sb-") && cookie.name.includes("-auth-token"));

  const isAuthenticated = !!supabaseAuthCookie?.value;

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users from auth routes to dashboard
  if (isAuthRoute && isAuthenticated) {
    const redirectTo = request.nextUrl.searchParams.get("redirectTo");
    const dashboardUrl = new URL(redirectTo || "/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     * - API routes (handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)",
  ],
};
