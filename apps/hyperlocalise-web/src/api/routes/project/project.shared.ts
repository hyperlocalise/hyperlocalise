import { and, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

const allowedMutationRoles = new Set<string>(["owner", "admin"]);

export function invalidProjectPayloadResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_project_payload" }, 400);
}

export function projectNotFoundResponse(c: {
  json(body: { error: string }, status: 404): Response;
}) {
  return c.json({ error: "project_not_found" }, 404);
}

export function forbiddenResponse(c: { json(body: { error: string }, status: 403): Response }) {
  return c.json({ error: "forbidden" }, 403);
}

export function isProjectMutationAllowed(role: ApiAuthContext["membership"]["role"]) {
  return allowedMutationRoles.has(role);
}

export function ownedProjectWhere(auth: ApiAuthContext, projectId: string) {
  return and(
    eq(schema.projects.id, projectId),
    eq(schema.projects.organizationId, auth.organization.localOrganizationId),
  );
}

export async function getOwnedProject(auth: ApiAuthContext, projectId: string) {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(ownedProjectWhere(auth, projectId))
    .limit(1);

  return project ?? null;
}
