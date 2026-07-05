import { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { jwtHandler } from "../lib/jwt.js";
import { isDemoMode } from "../config/demo.js";

/**
 * Tenant auth middleware.
 *
 * Verifies the Supabase JWT on every /api/v1 route (except health, docs, and
 * inbound webhooks) and injects `request.auth = { userId, orgId }` for
 * downstream handlers.
 *
 * - 401 when the bearer token is missing or fails verification.
 * - 403 when the caller asks for an org (x-org-id header) they are not a
 *   member of.
 * - orgId resolution order: `app_metadata.org_id` JWT claim, then the
 *   caller's organization_members rows (first membership wins until a real
 *   org switcher lands).
 */

export interface AuthContext {
  userId: string;
  orgId: string | null;
  email?: string;
}

export interface VerifiedToken {
  sub: string;
  email?: string;
  app_metadata?: {
    org_id?: unknown;
    [key: string]: unknown;
  };
}

export interface AuthMiddlewareOptions {
  /** Token verifier; injectable so tests can mock JWT verification. */
  verifyToken?: (token: string) => Promise<VerifiedToken>;
  /** Org-membership resolver; injectable so tests can mock the database. */
  resolveOrgIds?: (userId: string) => Promise<string[]>;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/**
 * Routes under /api/v1 that must stay reachable without a user JWT:
 * inbound webhooks (VAPI, Twilio, Stripe) authenticate via provider
 * signatures/secrets, and voice-tools authenticates via the voice-agent
 * shared secret. "/api/v1" (exact) is the public API info endpoint.
 */
const EXEMPT_PREFIXES = [
  "/api/v1/vapi/webhook",
  "/api/v1/twilio",
  "/api/v1/voice-tools",
  "/api/v1/billing/webhook",
  // Public marketing demo-call endpoint: feature-flagged, consent-gated, and
  // rate-limited by IP+number. Anonymous landing-page visitors must reach it
  // without a user JWT (its own safety posture replaces the tenant gate).
  "/api/v1/demo-call",
  // Public landing-page demo funnel: feature-flagged, SMS-OTP-verified, and
  // hard-limited to one demo call per number for life (DB unique constraint).
  // Anonymous visitors must reach it without a user JWT.
  "/api/v1/demo-funnel",
];

/** Demo identity used by the DEMO_MODE bypass below. */
export const DEMO_AUTH: AuthContext = {
  userId: "demo-user-000",
  orgId: "demo-org-000",
  email: "demo@concierge-ai.com",
};

const isExemptPath = (path: string): boolean => {
  if (path === "/api/v1" || path === "/api/v1/") return true;
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
};

const unauthorized = (message: string) => ({
  statusCode: 401,
  error: "Unauthorized",
  message,
});

const forbidden = (message: string) => ({
  statusCode: 403,
  error: "Forbidden",
  message,
});

const authMiddleware: FastifyPluginAsync<AuthMiddlewareOptions> = async (
  fastify,
  options,
) => {
  const verifyToken =
    options.verifyToken ??
    (async (token: string): Promise<VerifiedToken> =>
      (await jwtHandler.verifyToken(token)) as VerifiedToken);

  // Service-role usage justification: membership lookup IS the authorization
  // step for this request — there is no user-scoped client yet, and the query
  // is restricted to the verified caller's own user_id.
  const resolveOrgIds =
    options.resolveOrgIds ??
    (async (userId: string): Promise<string[]> => {
      const { data, error } = await fastify.supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", userId);

      if (error) {
        fastify.log.error({ error, userId }, "Failed to resolve org membership");
        return [];
      }
      return (data ?? []).map((row: { org_id: string }) => row.org_id);
    });

  if (!fastify.hasRequestDecorator("auth")) {
    fastify.decorateRequest("auth", null);
  }

  fastify.addHook("onRequest", async (request: FastifyRequest, reply) => {
    // ------------------------------------------------------------------
    // DEMO_MODE BYPASS — the single demo-mode auth code path. Everything
    // runs as a fixed demo identity; no tokens are verified. Never enable
    // in production.
    // ------------------------------------------------------------------
    if (isDemoMode()) {
      request.auth = { ...DEMO_AUTH };
      return;
    }

    const path = request.url.split("?")[0] ?? request.url;

    // Only /api/v1/* is guarded; /health, /docs, etc. pass through.
    if (!path.startsWith("/api/v1")) return;
    if (isExemptPath(path)) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send(unauthorized("Missing bearer token"));
    }

    let payload: VerifiedToken;
    try {
      payload = await verifyToken(authHeader.slice(7));
    } catch {
      return reply.code(401).send(unauthorized("Invalid or expired token"));
    }

    if (!payload?.sub) {
      return reply.code(401).send(unauthorized("Token has no subject"));
    }

    const claimOrgId =
      typeof payload.app_metadata?.org_id === "string"
        ? payload.app_metadata.org_id
        : null;

    const requestedOrgId = request.headers["x-org-id"];
    const requestedOrg =
      typeof requestedOrgId === "string" && requestedOrgId.length > 0
        ? requestedOrgId
        : null;

    let orgId = claimOrgId;

    if (requestedOrg || !orgId) {
      const memberships = await resolveOrgIds(payload.sub);

      if (requestedOrg) {
        const isMember =
          requestedOrg === claimOrgId || memberships.includes(requestedOrg);
        if (!isMember) {
          return reply
            .code(403)
            .send(forbidden("Not a member of the requested organization"));
        }
        orgId = requestedOrg;
      } else if (memberships.length > 1) {
        // Ambiguous: the user belongs to multiple orgs but neither an org_id
        // claim nor an x-org-id header selected one. Refuse rather than
        // silently picking the first membership.
        return reply.code(400).send({
          statusCode: 400,
          error: "OrgRequired",
          message:
            "Specify an organization (x-org-id) — user belongs to multiple.",
        });
      } else {
        orgId = memberships[0] ?? null;
      }
    }

    request.auth = {
      userId: payload.sub,
      orgId,
      email: payload.email,
    };
  });

  fastify.log.info("✓ Tenant auth middleware initialized (/api/v1 guarded)");
};

export default fp(authMiddleware, {
  name: "auth-middleware",
  fastify: ">=5.x",
});
