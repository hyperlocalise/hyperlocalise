import type { Context } from "hono";
import { validator } from "hono/validator";
import type { z } from "zod";

import { createLogger } from "@/lib/log";

import {
  badRequestResponse,
  internalErrorResponse,
  notFoundResponse,
  type JsonContext,
} from "./response.schema";

export * from "./response.schema";

const logger = createLogger("api-errors");

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Map a Zod validation failure to the standard error envelope.
 *
 * The `details` field contains a simplified list of issues so clients can
 * highlight invalid fields without parsing Zod internals.
 */
export function validationErrorResponse(
  c: JsonContext,
  code = "invalid_payload",
  message = "Request validation failed",
  issues?: z.ZodIssue[],
): Response {
  const details =
    issues && issues.length > 0
      ? { issues: issues.map((issue) => ({ path: issue.path, message: issue.message })) }
      : undefined;
  return badRequestResponse(c, code, message, details);
}

/**
 * Build a Hono `validator` callback that maps Zod parse failures to the
 * standard error envelope.
 *
 * Example:
 *   const validateBody = createZodValidator("json", bodySchema, "invalid_body");
 *   app.post("/", validateBody, handler);
 */
export function createZodValidator<T>(
  target: "json" | "param" | "query" | "header" | "cookie",
  schema: z.ZodType<T>,
  errorCode = "invalid_payload",
  errorMessage = "Request validation failed",
) {
  return validator(target, (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return validationErrorResponse(c, errorCode, errorMessage, parsed.error.issues);
    }
    return parsed.data;
  });
}

// ---------------------------------------------------------------------------
// App-level error handlers
// ---------------------------------------------------------------------------

/**
 * Fallback handler for unhandled errors thrown by route handlers or
 * middleware.
 *
 * Known, mapped errors (such as auth failures that already returned a
 * response) are re-thrown so they bubble up correctly. Everything else is
 * logged and returned as a generic `internal_error` without leaking
 * implementation details.
 */
export function handleUnexpectedError(err: Error, c: Context): Response {
  // If a middleware or route already sent a response (e.g. auth redirect),
  // don't overwrite it.
  if (c.finalized) {
    return c.res;
  }

  // Log the full error for observability; return a safe message to the client.
  logger.error({ error: err.message, stack: err.stack }, "Unhandled API error");

  return internalErrorResponse(
    c as unknown as JsonContext,
    "internal_error",
    "An unexpected error occurred",
  );
}

/**
 * Standard 404 handler for unmatched routes.  Returns the canonical
 * JSON error envelope.
 */
export function notFoundHandler(c: Context): Response {
  return notFoundResponse(c as unknown as JsonContext, "not_found", "Resource not found");
}
