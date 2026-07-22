/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  buildAccessibleProjectsWhere,
  canAccessProject,
  getVisibleTeamIds,
  hasOrganizationWideProjectAccess,
  ownedProjectWhere as teamOwnedProjectWhere,
} from "@/api/auth/team-access";
import { and, eq } from "drizzle-orm";
import {
  badRequestResponse,
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { getTmsProviderConnection } from "@/lib/providers/jobs/tms-provider-live";
import { tmsProviderLiveErrorResponse } from "@/lib/providers/jobs/tms-provider-live-error-response";
import {
  parseProviderProjectId,
  type EncodedProviderProjectId,
} from "@/lib/providers/jobs/tms-provider-resource-id";

const logger = createLogger("project-routes");
const externalTmsProviderKinds = new Set<string>(schema.externalTmsProviderKindEnum.enumValues);

function parseExternalProjectId(projectId: string) {
  const match = /^ext:([^:]+):(.+)$/.exec(projectId);
  if (!match) {
    return null;
  }

  const providerKind = match[1];
  if (!externalTmsProviderKinds.has(providerKind)) {
    return null;
  }

  return {
    providerKind: providerKind as (typeof schema.externalTmsProviderKindEnum.enumValues)[number],
    externalProjectId: match[2],
  };
}

export { buildAccessibleProjectsWhere };

export function invalidProjectPayloadResponse(c: { json: JsonContext["json"] }) {
  return validationErrorResponse(c, "invalid_project_payload", "Invalid project payload");
}

export function projectNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "project_not_found", "Project not found");
}

export function unsupportedProjectFileResponse(c: { json: JsonContext["json"] }, filename: string) {
  return badRequestResponse(c, "unsupported_translation_source_file", "Unsupported source file", {
    filename,
  });
}

export function projectForbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export type ProjectResourceTarget =
  | { kind: "native"; projectId: string }
  | ({ kind: "provider" } & EncodedProviderProjectId)
  | {
      kind: "provider_unavailable";
      error: "no_active_tms_provider" | "provider_project_not_available";
      message: string;
    };

/** Provider kind for the All Files release flag — matches the API CAT queue gate. */
export function catAllFilesProviderKindFromTarget(target: ProjectResourceTarget) {
  return target.kind === "provider" ? target.providerKind : null;
}

export async function resolveProjectResourceTarget(
  auth: ApiAuthContext,
  projectId: string,
): Promise<ProjectResourceTarget> {
  const encodedProject = parseProviderProjectId(projectId);
  if (!encodedProject) {
    return { kind: "native", projectId };
  }

  const connection = await getTmsProviderConnection(auth.organization.localOrganizationId);
  if (!connection) {
    return {
      kind: "provider_unavailable",
      error: "no_active_tms_provider",
      message: `No active ${encodedProject.providerKind} provider connection is available`,
    };
  }

  if (connection.providerKind !== encodedProject.providerKind) {
    return {
      kind: "provider_unavailable",
      error: "provider_project_not_available",
      message: `Project belongs to ${encodedProject.providerKind}, but the active provider is ${connection.providerKind}`,
    };
  }

  return { kind: "provider", ...encodedProject };
}

export function providerProjectUnavailableResponse(
  c: { json: JsonContext["json"] },
  target: Extract<ProjectResourceTarget, { kind: "provider_unavailable" }>,
) {
  return c.json({ error: target.error, message: target.message }, 404);
}

export { tmsProviderLiveErrorResponse };

export async function logProjectNotFound(input: {
  auth: ApiAuthContext;
  projectId: string;
  route: string;
}) {
  const { auth, projectId, route } = input;
  const organizationId = auth.organization.localOrganizationId;
  const externalProject = parseExternalProjectId(projectId);

  try {
    const [projectInOrganization] = await db
      .select({
        id: schema.projects.id,
        teamId: schema.projects.teamId,
        source: schema.projects.source,
        externalProviderKind: schema.projects.externalProviderKind,
        externalProjectId: schema.projects.externalProjectId,
        isActive: schema.projects.isActive,
      })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.id, projectId)),
      )
      .limit(1);

    const [externalProjectInOrganization] = externalProject
      ? await db
          .select({
            id: schema.projects.id,
            teamId: schema.projects.teamId,
            source: schema.projects.source,
            isActive: schema.projects.isActive,
          })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.organizationId, organizationId),
              eq(schema.projects.externalProviderKind, externalProject.providerKind),
              eq(schema.projects.externalProjectId, externalProject.externalProjectId),
            ),
          )
          .limit(1)
      : [];

    const hasOrganizationWideAccess = hasOrganizationWideProjectAccess(auth);
    const visibleTeamIds = hasOrganizationWideAccess ? [] : await getVisibleTeamIds(auth);

    logger.warn(
      {
        route,
        organizationId,
        activeTeamId: auth.activeTeam?.id ?? null,
        hasOrganizationWideAccess,
        visibleTeamCount: visibleTeamIds.length,
        projectId,
        externalProviderKind: externalProject?.providerKind ?? null,
        externalProjectId: externalProject?.externalProjectId ?? null,
        projectExistsInOrganization: Boolean(projectInOrganization),
        projectTeamId: projectInOrganization?.teamId ?? null,
        projectSource: projectInOrganization?.source ?? null,
        projectExternalProviderKind: projectInOrganization?.externalProviderKind ?? null,
        projectExternalProjectId: projectInOrganization?.externalProjectId ?? null,
        projectIsActive: projectInOrganization?.isActive ?? null,
        externalProjectExistsInOrganization: Boolean(externalProjectInOrganization),
        externalProjectRecordId: externalProjectInOrganization?.id ?? null,
        externalProjectTeamId: externalProjectInOrganization?.teamId ?? null,
        externalProjectSource: externalProjectInOrganization?.source ?? null,
        externalProjectIsActive: externalProjectInOrganization?.isActive ?? null,
      },
      "project lookup returned not found",
    );
  } catch (error) {
    logger.warn(
      {
        route,
        organizationId,
        projectId,
        err: serializeErrorForLog(error),
      },
      "project lookup diagnostics failed",
    );
  }
}

export function scheduleProjectNotFoundDiagnostics(input: {
  auth: ApiAuthContext;
  projectId: string;
  route: string;
}) {
  void logProjectNotFound(input).catch((error) => {
    logger.warn(
      {
        route: input.route,
        organizationId: input.auth.organization.localOrganizationId,
        projectId: input.projectId,
        err: serializeErrorForLog(error),
      },
      "project lookup diagnostics failed",
    );
  });
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
  return canAccessProject(auth, projectId);
}

export async function getOwnedProjectRecord(auth: ApiAuthContext, projectId: string) {
  const accessibleProject = await canAccessProject(auth, projectId);
  if (!accessibleProject) {
    return null;
  }

  // Access was already authorized (team scope for native, live TMS for
  // provider ids). Load the org-scoped row without re-applying team filters.
  const [organizationProject] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, auth.organization.localOrganizationId),
        eq(schema.projects.id, accessibleProject.id),
      ),
    )
    .limit(1);

  return organizationProject ?? null;
}
