import * as jose from "jose";

export interface JWTPayload {
  sub: string; // User ID
  email: string;
  aud: string;
  role: string;
  exp: number;
  iat: number;
  // Additional Supabase claims
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  user_metadata?: {
    first_name?: string;
    last_name?: string;
    display_name?: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

// Development bypass user
const DEV_USER: AuthUser = {
  id: process.env.DEV_USER_ID || "dev-user-id",
  email: process.env.DEV_USER_EMAIL || "dev@example.com",
  role: "authenticated",
  displayName: process.env.DEV_USER_NAME || "Dev User",
};

/**
 * JWT Handler for Supabase tokens
 * Uses the SUPABASE_JWT_SECRET for verification
 */
class JWTHandler {
  private secret: Uint8Array | null = null;

  private getSecret(): Uint8Array {
    if (this.secret) return this.secret;

    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("SUPABASE_JWT_SECRET is not configured");
    }

    this.secret = new TextEncoder().encode(jwtSecret);
    return this.secret;
  }

  /**
   * Verify and decode a Supabase JWT token
   */
  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const secret = this.getSecret();
      const { payload } = await jose.jwtVerify(token, secret, {
        audience: "authenticated",
        algorithms: ["HS256"],
      });

      return payload as unknown as JWTPayload;
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new Error("Token has expired");
      }
      if (error instanceof jose.errors.JWTClaimValidationFailed) {
        throw new Error("Invalid token claims");
      }
      throw new Error("Invalid token");
    }
  }

  /**
   * Extract user info from JWT payload
   */
  extractUser(payload: JWTPayload): AuthUser {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      firstName: payload.user_metadata?.first_name,
      lastName: payload.user_metadata?.last_name,
      displayName: payload.user_metadata?.display_name,
    };
  }

  /**
   * Check if auth is required based on environment
   */
  isAuthRequired(): boolean {
    return process.env.REQUIRE_AUTH !== "false";
  }

  /**
   * Get the development bypass user
   */
  getDevUser(): AuthUser {
    return DEV_USER;
  }
}

// Singleton instance
export const jwtHandler = new JWTHandler();
