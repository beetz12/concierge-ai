/**
 * Error Utilities
 * Proper serialization of Error objects for Pino logging
 */

/**
 * Serialize error objects for logging
 * Pino doesn't deeply serialize Error objects by default, resulting in {}
 *
 * @param error - Any error value
 * @returns Serialized error object with name, message, stack
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause ? serializeError(error.cause) : undefined,
    };
  }

  if (typeof error === "object" && error !== null) {
    // Handle axios errors and other error-like objects
    const obj = error as Record<string, unknown>;
    return {
      name: obj.name || "UnknownError",
      message: obj.message || String(error),
      code: obj.code,
      status: obj.status,
      response: obj.response
        ? {
            status: (obj.response as Record<string, unknown>).status,
            data: (obj.response as Record<string, unknown>).data,
          }
        : undefined,
    };
  }

  return { raw: String(error) };
}
