import { z } from "zod";

/**
 * ---------------------------------------------------------------------------
 * Hyperlocalise API Response Conventions
 * ---------------------------------------------------------------------------
 *
 * This module defines the standard shapes for JSON responses across the
 * Hyperlocalise Hono API.  New routes should import schemas and helpers
 * from here instead of inventing per-route envelopes.
 *
 * ## Success envelopes
 *
 * JSON routes return a **resource-keyed envelope**.  The top-level key is the
 * singular or plural name of the resource being returned:
 *
 *   { project: Project }                 // single resource
 *   { projects: Project[] }              // collection
 *   { job: { id, status, ... } }         // nested public-API shape
 *   { file: { id, filename, ... } }
 *
 * This is the existing convention and it is kept for backward compatibility
 * (especially for the `/api/v1/*` public API).
 *
 * ## Error envelopes
 *
 * All JSON error responses share this shape:
 *
 *   {
 *     error:   "machine_readable_code",   // required, snake_case
 *     message?: "Human-readable description", // optional but recommended
 *     details?: { ... }                     // optional structured context
 *   }
 *
 * The `error` code is the contract.  Clients should branch on it.  The
 * `message` field is for debugging and may change without notice.
 *
 * ## Exceptions (non-JSON or non-envelope responses)
 *
 * 1. **File downloads** – return the raw body with `Content-Disposition`
 *    and the correct `Content-Type`.  No JSON envelope.
 * 2. **204 No Content** – return `c.body(null, 204)` for successful DELETE
 *    operations.  No body at all.
 * 3. **Health checks** – may return a minimal shape such as `{ ok: boolean }`
 *    because they are consumed by load balancers and probes that expect a
 *    tiny, stable contract.
 * 4. **Webhook acknowledgements** – return whatever the external provider
 *    expects (often a bare 200/204 or `{ ok: true }`).  These are not
 *    part of the public REST contract.
 * 5. **Server-Sent Events / streaming** – body is an event stream, not JSON.
 *
 * ## Compatibility strategy
 *
 * The `/api/v1/*` public API already exposes resource-keyed envelopes.
 * Any future move to a unified `{ data, status }` envelope must be
 * introduced as a new API version (e.g. `/api/v2/*`) so that existing API
 * keys and integrations keep working.
 */

// ---------------------------------------------------------------------------
// Error schemas
// ---------------------------------------------------------------------------

/**
 * Standard error response schema.  Every JSON error response should validate
 * against this shape (extra fields are allowed when `details` carries
 * route-specific context).
 */
export const apiErrorResponseSchema = z.object({
  error: z.string().min(1).describe("Machine-readable error code, snake_case"),
  message: z.string().optional().describe("Human-readable error description"),
  details: z.unknown().optional().describe("Structured context such as validation errors"),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

/**
 * Common error codes used across the API.  This is a non-exhaustive union;
 * individual routes may define more specific codes.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "invalid_payload"
  | "resource_conflict"
  | "rate_limited"
  | "internal_error"
  | "service_unavailable";

// ---------------------------------------------------------------------------
// Typed error helpers
// ---------------------------------------------------------------------------

/** Context type accepted by the helper functions below. */
type JsonContext = {
  json(body: Record<string, unknown>, status: number): Response;
};

/**
 * Return a standard JSON error response.  Prefer the specific helpers
 * (`badRequestResponse`, `unauthorizedResponse`, etc.) in route code.
 *
 * The `extra` object is merged at the top level for backward-compatible
 * responses that pre-date the `{ error, message, details }` convention.
 * New routes should prefer nesting extra context inside `details`.
 */
export function apiErrorResponse(
  c: JsonContext,
  status: number,
  code: string,
  message?: string,
  details?: unknown,
  extra?: Record<string, unknown>,
): Response {
  const body: Record<string, unknown> = { error: code };
  if (message !== undefined) body.message = message;
  if (details !== undefined) body.details = details;
  if (extra !== undefined) Object.assign(body, extra);
  return c.json(body, status);
}

export function badRequestResponse(
  c: JsonContext,
  code = "bad_request",
  message?: string,
  details?: unknown,
): Response {
  return apiErrorResponse(c, 400, code, message, details);
}

export function unauthorizedResponse(
  c: JsonContext,
  code = "unauthorized",
  message?: string,
): Response {
  return apiErrorResponse(c, 401, code, message);
}

export function forbiddenResponse(c: JsonContext, code = "forbidden", message?: string): Response {
  return apiErrorResponse(c, 403, code, message);
}

export function notFoundResponse(c: JsonContext, code = "not_found", message?: string): Response {
  return apiErrorResponse(c, 404, code, message);
}

export function conflictResponse(
  c: JsonContext,
  code = "resource_conflict",
  message?: string,
  details?: unknown,
): Response {
  return apiErrorResponse(c, 409, code, message, details);
}

export function payloadTooLargeResponse(
  c: JsonContext,
  code = "payload_too_large",
  message?: string,
): Response {
  return apiErrorResponse(c, 413, code, message);
}

export function tooManyRequestsResponse(
  c: JsonContext,
  code = "rate_limited",
  message?: string,
): Response {
  return apiErrorResponse(c, 429, code, message);
}

export function internalErrorResponse(
  c: JsonContext,
  code = "internal_error",
  message?: string,
): Response {
  return apiErrorResponse(c, 500, code, message);
}

export function serviceUnavailableResponse(
  c: JsonContext,
  code = "service_unavailable",
  message?: string,
): Response {
  return apiErrorResponse(c, 503, code, message);
}

// ---------------------------------------------------------------------------
// Success-envelope helpers
// ---------------------------------------------------------------------------

/**
 * Build a Zod schema for a resource-keyed success envelope.
 *
 * Example:
 *   const projectResponseSchema = successEnvelopeSchema("project", projectSchema);
 *   // -> ZodObject<{ project: typeof projectSchema }>
 */
export function successEnvelopeSchema<K extends string, T extends z.ZodTypeAny>(
  key: K,
  resourceSchema: T,
) {
  return z.object({
    [key]: resourceSchema,
  } as { [P in K]: T });
}

/**
 * Build a Zod schema for a paginated collection envelope.
 *
 * Example:
 *   const projectsListSchema = collectionEnvelopeSchema("projects", projectSchema);
 *   // -> { projects: Project[], total: number, nextCursor?: string }
 */
export function collectionEnvelopeSchema<K extends string, T extends z.ZodTypeAny>(
  key: K,
  resourceSchema: T,
) {
  return z.object({
    [key]: z.array(resourceSchema),
    total: z.number().int().min(0).optional(),
    nextCursor: z.string().optional(),
  } as { [P in K]: z.ZodArray<T> } & {
    total?: z.ZodOptional<z.ZodNumber>;
    nextCursor?: z.ZodOptional<z.ZodString>;
  });
}
