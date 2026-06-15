import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import { createLogger } from "@/lib/log";
import { getTmsProviderConnection } from "@/lib/providers/tms-provider-live";
import { enqueueProviderCatalogSyncIntent } from "@/lib/providers/provider-sync-intent";

import type { OrganizationProjectListItem } from "./organization-project-list-item";
import { getOrganizationExternalTmsCredentialId } from "./upsert-external-tms-project-record";

const logger = createLogger("list-organization-projects");

async function attachOpenJobCounts(
  organizationId: string,
  projects: Project[],
): Promise<OrganizationProjectListItem[]> {
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return [];
  }

  const openJobCounts = await db
    .select({
      projectId: schema.jobs.projectId,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, organizationId),
        inArray(schema.jobs.projectId, projectIds),
        inArray(schema.jobs.status, ["queued", "running", "waiting_for_review"]),
      ),
    )
    .groupBy(schema.jobs.projectId);

  const openJobCountByProjectId = new Map(openJobCounts.map((row) => [row.projectId, row.count]));

  return projects.map((project) => ({
    ...project,
    openJobCount: openJobCountByProjectId.get(project.id) ?? 0,
  }));
}

function maybeEnqueueCatalogSync(input: {
  organizationId: string;
  providerKind: (typeof schema.externalTmsProviderKindEnum.enumValues)[number];
  providerCredentialId: string;
}) {
  void enqueueProviderCatalogSyncIntent({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
    providerKind: input.providerKind,
    cause: "manual",
  }).catch((error) => {
    logger.warn(
      {
        organizationId: input.organizationId,
        providerKind: input.providerKind,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      "failed to enqueue TMS catalog sync intent",
    );
  });
}

/**
 * Returns paginate-friendly project rows from the local database only.
 * Native and materialized external TMS projects coexist here; background
 * catalog sync keeps external projects up to date without mixing live API rows
 * into list responses.
 */
export async function listOrganizationProjects(
  auth: ApiAuthContext,
): Promise<OrganizationProjectListItem[]> {
  const organizationId = auth.organization.localOrganizationId;
  const databaseProjects = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        await buildAccessibleProjectsWhere(auth),
        or(isNull(schema.projects.isActive), eq(schema.projects.isActive, true)),
      ),
    )
    .orderBy(desc(schema.projects.updatedAt));

  const projects = await attachOpenJobCounts(organizationId, databaseProjects);

  const connection = await getTmsProviderConnection(organizationId);
  if (!connection) {
    return projects;
  }

  const providerCredentialId = await getOrganizationExternalTmsCredentialId(
    organizationId,
    connection.providerKind,
  );
  if (providerCredentialId) {
    maybeEnqueueCatalogSync({
      organizationId,
      providerKind: connection.providerKind,
      providerCredentialId,
    });
  }

  return projects;
}
