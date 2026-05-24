import { and, eq } from "drizzle-orm";

import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import { hasCapability } from "@/api/auth/policy";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

export function invalidProjectPayloadResponse(c: { json: JsonContext["json"] }) {
  return validationErrorResponse(c, "invalid_project_payload", "Invalid project payload");
}

export function projectNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "project_not_found", "Project not found");
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export function isProjectMutationAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "projects:write");
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
