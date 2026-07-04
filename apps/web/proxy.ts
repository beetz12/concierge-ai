import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

// Anonymous access is deny-by-default (outside demo mode): only the auth
// pages and the explicit public marketing/auth-flow routes skip the redirect.
const AUTH_ROUTES = ["/login", "/register"];
const PUBLIC_ROUTES = ["/", "/about", "/auth/callback", "/auth/verify-email"];

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.next();
  }

  const response = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const supabaseAuthCookie = request.cookies
    .getAll()
    .find((cookie) => cookie.name.includes("sb-") && cookie.name.includes("-auth-token"));

  const isAuthenticated = Boolean(supabaseAuthCookie?.value);

  if (!isAuthenticated && !isAuthRoute && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && isAuthenticated) {
    const redirectTo = request.nextUrl.searchParams.get("redirectTo");
    const dashboardUrl = new URL(redirectTo || "/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // Signed-in visitors landing on the public marketing home go straight into
  // the app; the landing page stays fully public for logged-out visitors.
  if (pathname === "/" && isAuthenticated) {
    return NextResponse.redirect(new URL("/dispatch", request.url));
  }

  if (isPublicRoute) {
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)",
  ],
};
