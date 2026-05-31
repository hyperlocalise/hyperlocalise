import {
  buildAccessibleProjectsWhere,
  ownedProjectWhere as teamOwnedProjectWhere,
} from "@/api/auth/team-access";
import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

export { buildAccessibleProjectsWhere };

export function invalidProjectPayloadResponse(c: { json: JsonContext["json"] }) {
  return validationErrorResponse(c, "invalid_project_payload", "Invalid project payload");
}

export function projectNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "project_not_found", "Project not found");
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export {
  isProjectCreateAllowed,
  isProjectMutationAllowed,
  isProjectWriteAllowed,
} from "@/api/auth/capability-guards";

export async function ownedProjectWhere(auth: ApiAuthContext, projectId: string) {
  return teamOwnedProjectWhere(auth, projectId);
}

export async function getOwnedProject(auth: ApiAuthContext, projectId: string) {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(await ownedProjectWhere(auth, projectId))
    .limit(1);

  return project ?? null;
}

export async function getOwnedProjectRecord(auth: ApiAuthContext, projectId: string) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(await ownedProjectWhere(auth, projectId))
    .limit(1);

  return project ?? null;
}
