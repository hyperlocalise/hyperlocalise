import { and, eq, inArray, ne, notInArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import type { TmsProviderLiveProject } from "@/lib/providers/tms-provider-live";
import {
  encodeProviderJobId,
  encodeProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";
import {
  mapProviderStatusToNormalized,
  type ExternalTmsJobTaskMetadata,
} from "@/lib/providers/tms-provider-types";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildJobInputPayload(input: {
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  task: ExternalTmsJobTaskMetadata;
}) {
  return {
    source: "external_tms",
    providerKind: input.providerKind,
    externalProjectId: input.externalProjectId,
    externalJobId: input.task.externalJobId,
    externalTaskId: input.task.externalTaskId ?? null,
  };
}

export class ExternalTmsSyncService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "projects.external-tms-sync");
  }

  async upsertProjectRecord(input: {
    organizationId: string;
    providerCredentialId: string;
    liveProject: TmsProviderLiveProject;
    userId?: string | null;
  }) {
    const projectId = encodeProviderProjectId({
      providerKind: input.liveProject.externalProviderKind,
      externalProjectId: input.liveProject.externalProjectId,
    });

    await this.database
      .insert(schema.projects)
      .values({
        id: projectId,
        organizationId: input.organizationId,
        teamId: null,
        createdByUserId: input.userId ?? null,
        updatedByUserId: input.userId ?? null,
        name: input.liveProject.name,
        description: input.liveProject.description ?? "",
        translationContext: input.liveProject.translationContext ?? "",
        source: "external_tms",
        externalProviderKind: input.liveProject.externalProviderKind,
        externalProviderCredentialId: input.providerCredentialId,
        externalProjectId: input.liveProject.externalProjectId,
        sourceLocale: input.liveProject.sourceLocale,
        targetLocales: input.liveProject.targetLocales,
        externalProjectUrl: input.liveProject.externalProjectUrl,
        isActive: input.liveProject.isActive,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.projects.id, schema.projects.organizationId],
        set: {
          name: input.liveProject.name,
          description: input.liveProject.description ?? "",
          translationContext: input.liveProject.translationContext ?? "",
          sourceLocale: input.liveProject.sourceLocale,
          targetLocales: input.liveProject.targetLocales,
          externalProjectUrl: input.liveProject.externalProjectUrl,
          isActive: input.liveProject.isActive,
          externalProviderCredentialId: input.providerCredentialId,
          updatedByUserId: input.userId ?? null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    this.log.info(
      {
        organizationId: input.organizationId,
        projectId,
        providerKind: input.liveProject.externalProviderKind,
        externalProjectId: input.liveProject.externalProjectId,
      },
      "upserted external TMS project record",
    );

    return projectId;
  }

  async deactivateAllProjectsForCredential(input: {
    organizationId: string;
    providerCredentialId: string;
    providerKind: (typeof schema.externalTmsProviderKindEnum.enumValues)[number];
  }) {
    const now = new Date();
    const deactivated = await this.database
      .update(schema.projects)
      .set({
        isActive: false,
        updatedAt: now,
      })
      .where(this.externalTmsProjectsScope(input))
      .returning({ id: schema.projects.id });

    await this.removeJobsForProjects({
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      projectIds: deactivated.map((project) => project.id),
    });

    if (deactivated.length > 0) {
      this.log.info(
        {
          organizationId: input.organizationId,
          providerKind: input.providerKind,
          providerCredentialId: input.providerCredentialId,
          deactivatedCount: deactivated.length,
        },
        "deactivated all external TMS projects for credential",
      );
    }

    return deactivated.length;
  }

  async deactivateMissingProjects(input: {
    organizationId: string;
    providerCredentialId: string;
    providerKind: (typeof schema.externalTmsProviderKindEnum.enumValues)[number];
    syncedProjectIds: string[];
  }) {
    if (input.syncedProjectIds.length === 0) {
      return this.deactivateAllProjectsForCredential(input);
    }

    const now = new Date();
    const deactivated = await this.database
      .update(schema.projects)
      .set({
        isActive: false,
        updatedAt: now,
      })
      .where(
        and(
          this.externalTmsProjectsScope(input),
          notInArray(schema.projects.id, input.syncedProjectIds),
        ),
      )
      .returning({ id: schema.projects.id });

    await this.removeJobsForProjects({
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      projectIds: deactivated.map((project) => project.id),
    });

    if (deactivated.length > 0) {
      this.log.info(
        {
          organizationId: input.organizationId,
          providerKind: input.providerKind,
          deactivatedCount: deactivated.length,
        },
        "deactivated missing external TMS projects",
      );
    }

    return deactivated.length;
  }

  async deactivateProject(input: { organizationId: string; projectId: string }) {
    const now = new Date();
    const deactivated = await this.database
      .update(schema.projects)
      .set({
        isActive: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, input.organizationId),
          eq(schema.projects.source, "external_tms"),
          eq(schema.projects.isActive, true),
        ),
      )
      .returning({
        id: schema.projects.id,
        externalProviderKind: schema.projects.externalProviderKind,
      });

    if (deactivated.length === 0) {
      return false;
    }

    const [project] = deactivated;
    if (project.externalProviderKind) {
      await this.removeJobsForProjects({
        organizationId: input.organizationId,
        providerKind: project.externalProviderKind,
        projectIds: [project.id],
      });
    }

    this.log.info(
      { organizationId: input.organizationId, projectId: input.projectId },
      "deactivated external TMS project",
    );

    return true;
  }

  async getOrganizationCredentialId(
    organizationId: string,
    providerKind: (typeof schema.externalTmsProviderKindEnum.enumValues)[number],
  ) {
    const [credential] = await this.database
      .select({ id: schema.organizationExternalTmsProviderCredentials.id })
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId),
          eq(schema.organizationExternalTmsProviderCredentials.providerKind, providerKind),
        ),
      )
      .limit(1);

    return credential?.id ?? null;
  }

  async upsertJobRecords(input: {
    organizationId: string;
    projectId: string;
    providerKind: ExternalTmsProviderKind;
    externalProjectId: string;
    tasks: ExternalTmsJobTaskMetadata[];
  }) {
    const now = new Date();
    let upserted = 0;
    const newlySyncedJobIds: string[] = [];

    const candidateJobIds = input.tasks.map((task) =>
      encodeProviderJobId({
        providerKind: input.providerKind,
        externalProjectId: input.externalProjectId,
        externalJobId: task.externalJobId,
      }),
    );
    const existingJobRows =
      candidateJobIds.length > 0
        ? await this.database
            .select({ id: schema.jobs.id })
            .from(schema.jobs)
            .where(inArray(schema.jobs.id, candidateJobIds))
        : [];
    const existingJobIds = new Set(existingJobRows.map((row) => row.id));

    for (const task of input.tasks) {
      const jobId = encodeProviderJobId({
        providerKind: input.providerKind,
        externalProjectId: input.externalProjectId,
        externalJobId: task.externalJobId,
      });
      const isNewlySynced = !existingJobIds.has(jobId);
      const status = mapProviderStatusToNormalized(input.providerKind, task.externalStatus);
      const completedAt =
        status === "succeeded" || status === "failed" ? normalizeDate(task.completedAt) : null;
      const dueDate = normalizeDate(task.dueDate);
      const inputPayload = buildJobInputPayload({
        providerKind: input.providerKind,
        externalProjectId: input.externalProjectId,
        task,
      });

      await this.database.transaction(async (tx) => {
        await tx
          .insert(schema.jobs)
          .values({
            id: jobId,
            organizationId: input.organizationId,
            projectId: input.projectId,
            createdByUserId: null,
            ownerUserId: null,
            kind: task.kind ?? "translation",
            status,
            inputPayload,
            completedAt,
          })
          .onConflictDoUpdate({
            target: schema.jobs.id,
            set: {
              projectId: input.projectId,
              kind: task.kind ?? "translation",
              status,
              inputPayload,
              completedAt,
              updatedAt: now,
            },
          });

        await tx
          .insert(schema.externalJobDetails)
          .values({
            jobId,
            organizationId: input.organizationId,
            providerKind: input.providerKind,
            externalJobId: task.externalJobId,
            externalTaskId: task.externalTaskId ?? null,
            externalStatus: task.externalStatus,
            title: task.title ?? "Untitled task",
            dueDate,
            targetLocales: task.targetLocales ?? [],
            assignedUsers: task.assignedUsers ?? [],
            externalUrl: task.externalUrl ?? null,
            syncState: "synced",
            providerPayload: task.providerPayload ?? {},
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              schema.externalJobDetails.organizationId,
              schema.externalJobDetails.externalJobId,
              schema.externalJobDetails.providerKind,
            ],
            set: {
              externalTaskId: task.externalTaskId ?? null,
              externalStatus: task.externalStatus,
              title: task.title ?? "Untitled task",
              dueDate,
              targetLocales: task.targetLocales ?? [],
              assignedUsers: task.assignedUsers ?? [],
              externalUrl: task.externalUrl ?? null,
              syncState: "synced",
              providerPayload: task.providerPayload ?? {},
              updatedAt: now,
            },
          });
      });

      upserted += 1;
      if (isNewlySynced) {
        newlySyncedJobIds.push(jobId);
      }
    }

    const removed = await this.reconcileMissingJobs({
      organizationId: input.organizationId,
      projectId: input.projectId,
      providerKind: input.providerKind,
      syncedJobIds: candidateJobIds,
    });

    if (upserted > 0 || removed > 0) {
      await this.database
        .update(schema.projects)
        .set({
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.projects.id, input.projectId),
            eq(schema.projects.organizationId, input.organizationId),
          ),
        );
    }

    this.log.info(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        providerKind: input.providerKind,
        upserted,
        removed,
        newlySyncedCount: newlySyncedJobIds.length,
      },
      "upserted external TMS job records",
    );

    return { upserted, newlySyncedJobIds, removed };
  }

  async removeAllJobsForProject(input: {
    organizationId: string;
    projectId: string;
    providerKind: ExternalTmsProviderKind;
  }) {
    const staleJobs = await this.database
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(this.externalTmsJobsScope(input));

    const removed = await this.cancelExternalTmsJobs(staleJobs.map((job) => job.id));

    if (removed > 0) {
      this.log.info(
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          providerKind: input.providerKind,
          removedCount: removed,
        },
        "removed all external TMS jobs for project",
      );
    }

    return removed;
  }

  async reconcileMissingJobs(input: {
    organizationId: string;
    projectId: string;
    providerKind: ExternalTmsProviderKind;
    syncedJobIds: string[];
  }) {
    if (input.syncedJobIds.length === 0) {
      return this.removeAllJobsForProject(input);
    }

    const staleJobs = await this.database
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(and(this.externalTmsJobsScope(input), notInArray(schema.jobs.id, input.syncedJobIds)));

    return this.cancelExternalTmsJobs(staleJobs.map((job) => job.id));
  }

  private async removeJobsForProjects(input: {
    organizationId: string;
    providerKind: ExternalTmsProviderKind;
    projectIds: string[];
  }) {
    let removedJobs = 0;

    for (const projectId of input.projectIds) {
      removedJobs += await this.removeAllJobsForProject({
        organizationId: input.organizationId,
        projectId,
        providerKind: input.providerKind,
      });
    }

    return removedJobs;
  }

  private externalTmsProjectsScope(input: {
    organizationId: string;
    providerCredentialId: string;
    providerKind: (typeof schema.externalTmsProviderKindEnum.enumValues)[number];
  }) {
    return and(
      eq(schema.projects.organizationId, input.organizationId),
      eq(schema.projects.source, "external_tms"),
      eq(schema.projects.externalProviderKind, input.providerKind),
      eq(schema.projects.externalProviderCredentialId, input.providerCredentialId),
      eq(schema.projects.isActive, true),
    );
  }

  private externalTmsJobsScope(input: {
    organizationId: string;
    projectId: string;
    providerKind: ExternalTmsProviderKind;
  }) {
    return and(
      eq(schema.jobs.organizationId, input.organizationId),
      eq(schema.jobs.projectId, input.projectId),
      eq(schema.externalJobDetails.providerKind, input.providerKind),
      ne(schema.externalJobDetails.syncState, "removed"),
    );
  }

  private async cancelExternalTmsJobs(jobIds: string[]) {
    if (jobIds.length === 0) {
      return 0;
    }

    const now = new Date();

    await this.database.transaction(async (tx) => {
      await tx
        .update(schema.jobs)
        .set({
          status: "cancelled",
          completedAt: now,
          updatedAt: now,
        })
        .where(inArray(schema.jobs.id, jobIds));

      await tx
        .update(schema.externalJobDetails)
        .set({
          externalStatus: "removed_from_provider",
          syncState: "removed",
          updatedAt: now,
        })
        .where(inArray(schema.externalJobDetails.jobId, jobIds));
    });

    return jobIds.length;
  }
}

export const externalTmsSyncService = new ExternalTmsSyncService();

export const upsertExternalTmsProjectRecord = (
  input: Parameters<ExternalTmsSyncService["upsertProjectRecord"]>[0],
) => externalTmsSyncService.upsertProjectRecord(input);

export const deactivateMissingExternalTmsProjects = (
  input: Parameters<ExternalTmsSyncService["deactivateMissingProjects"]>[0],
) => externalTmsSyncService.deactivateMissingProjects(input);

export const deactivateExternalTmsProject = (
  input: Parameters<ExternalTmsSyncService["deactivateProject"]>[0],
) => externalTmsSyncService.deactivateProject(input);

export const getOrganizationExternalTmsCredentialId = (
  organizationId: string,
  providerKind: Parameters<ExternalTmsSyncService["getOrganizationCredentialId"]>[1],
) => externalTmsSyncService.getOrganizationCredentialId(organizationId, providerKind);

export const upsertExternalTmsJobRecords = (
  input: Parameters<ExternalTmsSyncService["upsertJobRecords"]>[0],
) => externalTmsSyncService.upsertJobRecords(input);

export const removeAllExternalTmsJobsForProject = (
  input: Parameters<ExternalTmsSyncService["removeAllJobsForProject"]>[0],
) => externalTmsSyncService.removeAllJobsForProject(input);

export const reconcileMissingExternalTmsJobs = (
  input: Parameters<ExternalTmsSyncService["reconcileMissingJobs"]>[0],
) => externalTmsSyncService.reconcileMissingJobs(input);
