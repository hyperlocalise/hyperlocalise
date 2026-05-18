import type { ApiAuthContext } from "@/api/auth/workos";
import type { JsonContext } from "@/api/errors";

export function slugifyTeamName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function forbiddenResponse(c: { json(body: { error: string }, status: 403): Response }) {
  return c.json({ error: "forbidden" }, 403);
}

export function teamNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "team_not_found" }, 404);
}

export function invalidTeamPayloadResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_team_payload" }, 400);
}

export function teamSlugAlreadyExistsResponse(c: {
  json(body: { error: string }, status: 409): Response;
}) {
  return c.json({ error: "team_slug_already_exists" }, 409);
}

export function organizationMemberNotFoundResponse(c: { json: JsonContext["json"] }) {
  return c.json({ error: "organization_member_not_found" }, 404);
}

export function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

export function isTeamMutationAllowed(auth: ApiAuthContext) {
  return auth.membership.role === "owner" || auth.membership.role === "admin";
}
