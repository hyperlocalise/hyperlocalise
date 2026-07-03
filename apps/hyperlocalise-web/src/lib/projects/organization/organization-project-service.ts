import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getTmsProviderLiveProject } from "@/lib/providers/tms-provider-live";
import {
  encodeProviderProjectId,
  parseProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { ExternalTmsSyncService } from "@/lib/projects/external-tms/external-tms-sync-service";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";

import type { OrganizationProjectListItem } from "./organization-project-list-item";

export type EnsureOrganizationProjectError = {
  code: "project_not_found";
  reason:
    | "invalid_project_id"
    | "native_project_missing"
    | "invalid_external_project_id"
    | "tms_provider_unavailable"
    | "tms_provider_mismatch"
    | "external_project_unavailable"
    | "external_project_id_collision";
  organizationId: string;
  projectId?: string;
  providerKind?: string;
  externalProjectId?: string;
  activeProviderKind?: string;
};

function projectNotFound(
  reason: EnsureOrganizationProjectError["reason"],
  details: Omit<EnsureOrganizationProjectError, "code" | "reason">,
): EnsureOrganizationProjectError {
  return {
    code: "project_not_found",
    reason,
    ...details,
  };
}

export class OrganizationProjectService extends ProjectServiceBase {
  private readonly externalTmsSync: ExternalTmsSyncService;

  constructor(
    database: typeof db = db,
    externalTmsSync: ExternalTmsSyncService = new ExternalTmsSyncService(database),
  ) {
    super(database, "projects.organization");
    this.externalTmsSync = externalTmsSync;
  }

  /**
   * Resolves a project id for org-scoped writes that require a `projects` row.
   * Native projects must already exist. External TMS projects are materialized
   * from the active provider when needed.
   */
  async ensureRecord(input: {
    organizationId: string;
    projectId: string;
    userId?: string | null;
  }): Promise<Result<string, EnsureOrganizationProjectError>> {
    const projectId = normalizeProjectId(input.projectId);
    if (typeof projectId !== "string" || projectId.length === 0) {
      const error = projectNotFound("invalid_project_id", {
        organizationId: input.organizationId,
        projectId: typeof input.projectId === "string" ? input.projectId : undefined,
      });
      this.log.warn(error, "organization project resolution failed");
      return err(error);
    }

    const [existing] = await this.database
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, input.organizationId),
          eq(schema.projects.id, projectId),
        ),
      )
      .limit(1);

    if (existing) {
      this.log.info(
        {
          organizationId: input.organizationId,
          projectId: existing.id,
          resolution: "existing_record",
        },
        "organization project resolved from database",
      );
      return ok(existing.id);
    }

    const encodedProject = parseProviderProjectId(projectId);
    if (!encodedProject) {
      const error = projectNotFound("native_project_missing", {
        organizationId: input.organizationId,
        projectId,
      });
      this.log.warn(error, "organization project resolution failed");
      return err(error);
    }

    const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
      input.organizationId,
    );
    if (!credential) {
      const error = projectNotFound("tms_provider_unavailable", {
        organizationId: input.organizationId,
        projectId,
        providerKind: encodedProject.providerKind,
        externalProjectId: encodedProject.externalProjectId,
      });
      this.log.warn(error, "organization project resolution failed");
      return err(error);
    }

    if (credential.providerKind !== encodedProject.providerKind) {
      const error = projectNotFound("tms_provider_mismatch", {
        organizationId: input.organizationId,
        projectId,
        providerKind: encodedProject.providerKind,
        externalProjectId: encodedProject.externalProjectId,
        activeProviderKind: credential.providerKind,
      });
      this.log.warn(error, "organization project resolution failed");
      return err(error);
    }

    const liveProject = await getTmsProviderLiveProject(
      input.organizationId,
      encodedProject.externalProjectId,
      { actorUserId: input.userId },
    );
    if (!liveProject) {
      const error = projectNotFound("external_project_unavailable", {
        organizationId: input.organizationId,
        projectId,
        providerKind: encodedProject.providerKind,
        externalProjectId: encodedProject.externalProjectId,
      });
      this.log.warn(error, "organization project resolution failed");
      return err(error);
    }

    const canonicalProjectId = encodeProviderProjectId(encodedProject);

    const [existingProjectOwner] = await this.database
      .select({ organizationId: schema.projects.organizationId })
      .from(schema.projects)
      .where(eq(schema.projects.id, canonicalProjectId))
      .limit(1);

    if (existingProjectOwner && existingProjectOwner.organizationId !== input.organizationId) {
      const error = projectNotFound("external_project_id_collision", {
        organizationId: input.organizationId,
        projectId,
        providerKind: encodedProject.providerKind,
        externalProjectId: encodedProject.externalProjectId,
      });
      this.log.warn(error, "organization project resolution failed");
      return err(error);
    }

    await this.externalTmsSync.upsertProjectRecord({
      organizationId: input.organizationId,
      providerCredentialId: credential.id,
      liveProject,
      userId: input.userId,
    });

    this.log.info(
      {
        organizationId: input.organizationId,
        projectId: canonicalProjectId,
        providerKind: encodedProject.providerKind,
        externalProjectId: encodedProject.externalProjectId,
        resolution: "materialized_external_tms",
      },
      "organization project materialized from external TMS provider",
    );

    return ok(canonicalProjectId);
  }

  unwrapRecord(result: Result<string, EnsureOrganizationProjectError>): string {
    if (isErr(result)) {
      const {
        code,
        reason,
        organizationId,
        projectId,
        providerKind,
        externalProjectId,
        activeProviderKind,
      } = result.error;
      throw Object.assign(new Error(code), {
        reason,
        organizationId,
        projectId,
        providerKind,
        externalProjectId,
        activeProviderKind,
      });
    }

    return result.value;
  }

  /** Returns native workspace projects from the local database only. */
  async list(auth: ApiAuthContext): Promise<OrganizationProjectListItem[]> {
    const organizationId = auth.organization.localOrganizationId;
    const databaseProjects = await this.database
      .select()
      .from(schema.projects)
      .where(
        and(
          await buildAccessibleProjectsWhere(auth),
          eq(schema.projects.source, "native"),
          or(isNull(schema.projects.isActive), eq(schema.projects.isActive, true)),
        ),
      )
      .orderBy(desc(schema.projects.updatedAt));

    const projects = await this.attachOpenJobCounts(organizationId, databaseProjects);

    this.log.debug(
      { organizationId, projectCount: projects.length },
      "listed organization projects",
    );

    return projects;
  }

  private async attachOpenJobCounts(
    organizationId: string,
    projects: Project[],
  ): Promise<OrganizationProjectListItem[]> {
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length === 0) {
      return [];
    }

    const openJobCounts = await this.database
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
}

export const organizationProjectService = new OrganizationProjectService();

export const ensureOrganizationProjectRecord = (
  input: Parameters<OrganizationProjectService["ensureRecord"]>[0],
) => organizationProjectService.ensureRecord(input);

export const unwrapOrganizationProjectRecord = (
  result: Parameters<OrganizationProjectService["unwrapRecord"]>[0],
) => organizationProjectService.unwrapRecord(result);

export const listOrganizationProjects = (auth: ApiAuthContext) =>
  organizationProjectService.list(auth);
