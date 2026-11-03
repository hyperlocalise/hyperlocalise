/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { isProjectMutationAllowed } from "@/api/auth/capability-guards";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import {
  badRequestResponse,
  conflictResponse,
  notFoundResponse,
  type JsonContext,
} from "@/api/response.schema";
import {
  getOwnedProjectRecord,
  projectForbiddenResponse,
  projectNotFoundResponse,
} from "@/api/routes/project/project.shared";
import { validateContentSyncConfig } from "@/lib/agents/content-sync/content-sync-config";
import {
  normalizeContentSyncConfig,
  type ContentSyncConfig,
} from "@/lib/agents/content-sync/content-sync-types";
import { enqueueActivityLogEvent } from "@/lib/activity-log/activity-log-writer";
import { db, schema } from "@/lib/database/client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  deleteProjectContentSync,
  findOverlappingContentSyncAutomation,
  getProjectContentSync,
  listProjectContentSyncRuns,
  saveProjectContentSync,
  startProjectContentSyncRun,
  type ProjectContentSyncRow,
  type ProjectContentSyncRunRow,
} from "@/lib/projects/content-sync/project-content-sync";
import type { ProjectContentSyncQueue } from "@/lib/workflow/types";
import { createProjectContentSyncQueue } from "@/workflows/adapters";

import {
  projectContentSyncParamsSchema,
  saveProjectContentSyncBodySchema,
} from "./project-content-sync.schema";

const RECENT_RUN_LIMIT = 10;

const validateParams = validator("param", (value, c) => {
  const parsed = projectContentSyncParamsSchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_params",
      "Invalid project",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateSaveBody = validator("json", (value, c) => {
  const parsed = saveProjectContentSyncBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_content_sync_payload",
      "Invalid sync settings",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

function serializeSync(sync: ProjectContentSyncRow) {
  const config = normalizeContentSyncConfig(sync.syncConfig);
  return {
    id: sync.id,
    syncConfig: config,
    schedule: sync.schedule,
    nextRunAt: sync.nextRunAt?.toISOString() ?? null,
    updatedAt: sync.updatedAt.toISOString(),
  };
}

function readSummaryCount(value: unknown, key: string): number {
  if (value && typeof value === "object" && key in value) {
    const count = (value as Record<string, unknown>)[key];
    return typeof count === "number" ? count : 0;
  }
  return 0;
}

function serializeRun(run: ProjectContentSyncRunRow) {
  const pulled = run.summary?.pulled;
  const pushed = run.summary?.pushed;
  const pullRequestUrl =
    pushed && typeof pushed === "object" && "pullRequestUrl" in pushed
      ? pushed.pullRequestUrl
      : null;
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    pulled: run.summary
      ? {
          uploaded: readSummaryCount(pulled, "uploaded"),
          skipped: readSummaryCount(pulled, "skipped"),
          failed: readSummaryCount(pulled, "failed"),
        }
      : null,
    written: run.summary ? readSummaryCount(pushed, "written") : null,
    pullRequestUrl: typeof pullRequestUrl === "string" ? pullRequestUrl : null,
    errorCode: run.errorCode,
    // Stored messages are the provider's own user-facing text; thrown errors are stored generically.
    errorMessage: run.errorMessage,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

async function requireNativeProject(auth: AuthVariables["auth"], projectId: string) {
  const project = await getOwnedProjectRecord(auth, projectId);
  if (!project) {
    return { kind: "missing" as const };
  }
  if (project.source !== "native") {
    return { kind: "unsupported" as const };
  }
  return { kind: "ok" as const, project };
}

function projectUnavailableResponse(c: JsonContext, kind: "missing" | "unsupported") {
  return kind === "missing"
    ? projectNotFoundResponse(c)
    : badRequestResponse(c, "content_sync_not_supported", "Sync is for native projects");
}

type SyncConnectionError = { code: string; message: string };

const CONNECTION_REQUIRED_ERROR: SyncConnectionError = {
  code: "content_sync_connection_required",
  message: "Choose a repository that is enabled in Integrations.",
};

/** Checks the connection belongs to the workspace and fills in what the provider owns. */
async function resolveSyncConnection(input: {
  organizationId: string;
  syncConfig: ContentSyncConfig;
}): Promise<Result<ContentSyncConfig, SyncConnectionError>> {
  const validated = validateContentSyncConfig(input.syncConfig);
  if (isErr(validated)) {
    return validated;
  }
  const config = validated.value;

  switch (config.provider) {
    case "github": {
      if (!z.string().uuid().safeParse(config.connectionId).success) {
        return err(CONNECTION_REQUIRED_ERROR);
      }
      const [repository] = await db
        .select({
          fullName: schema.githubInstallationRepositories.fullName,
          enabled: schema.githubInstallationRepositories.enabled,
          archived: schema.githubInstallationRepositories.archived,
        })
        .from(schema.githubInstallationRepositories)
        .where(
          and(
            eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
            eq(schema.githubInstallationRepositories.id, config.connectionId),
          ),
        )
        .limit(1);
      if (!repository || !repository.enabled || repository.archived) {
        return err(CONNECTION_REQUIRED_ERROR);
      }
      return ok({ ...config, resourceKey: repository.fullName });
    }
    default:
      return err({
        code: "content_sync_provider_not_ready",
        message: `Content sync for ${config.provider} is not available yet.`,
      });
  }
}

async function recordSyncSettingsChange(auth: AuthVariables["auth"], projectId: string) {
  await enqueueActivityLogEvent({
    actorCredentialId: null,
    actorKind: "user",
    actorUserId: auth.user.localUserId,
    eventType: "project_settings_changed",
    organizationId: auth.organization.localOrganizationId,
    payload: { changedFields: ["sync"], projectId },
    targetId: projectId,
    targetKind: "project",
  });
}

export function createProjectContentSyncRoutes(
  options: { projectContentSyncQueue?: ProjectContentSyncQueue } = {},
) {
  const queue = options.projectContentSyncQueue ?? createProjectContentSyncQueue();

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateParams, async (c) => {
      const resolved = await requireNativeProject(c.var.auth, c.req.valid("param").projectId);
      if (resolved.kind !== "ok") {
        return projectUnavailableResponse(c, resolved.kind);
      }

      const sync = await getProjectContentSync({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
      });
      const runs = sync
        ? await listProjectContentSyncRuns({
            organizationId: resolved.project.organizationId,
            syncId: sync.id,
            limit: RECENT_RUN_LIMIT,
          })
        : [];

      return c.json(
        {
          contentSync: {
            sync: sync ? serializeSync(sync) : null,
            runs: runs.map(serializeRun),
          },
        },
        200,
      );
    })
    .get("/connections", validateParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c.var.auth, c.req.valid("param").projectId);
      if (resolved.kind !== "ok") {
        return projectUnavailableResponse(c, resolved.kind);
      }

      // GitHub is the only provider whose sync runs today; other providers add their connections here.
      const repositories = await db
        .select({
          id: schema.githubInstallationRepositories.id,
          fullName: schema.githubInstallationRepositories.fullName,
        })
        .from(schema.githubInstallationRepositories)
        .where(
          and(
            eq(
              schema.githubInstallationRepositories.organizationId,
              resolved.project.organizationId,
            ),
            eq(schema.githubInstallationRepositories.enabled, true),
            eq(schema.githubInstallationRepositories.archived, false),
          ),
        )
        .orderBy(asc(schema.githubInstallationRepositories.fullName));

      return c.json(
        {
          connections: repositories.map((repository) => ({
            provider: "github" as const,
            connectionId: repository.id,
            resourceKey: repository.fullName,
          })),
        },
        200,
      );
    })
    .put("/", validateParams, validateSaveBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c.var.auth, c.req.valid("param").projectId);
      if (resolved.kind !== "ok") {
        return projectUnavailableResponse(c, resolved.kind);
      }

      const body = c.req.valid("json");
      const config = await resolveSyncConnection({
        organizationId: resolved.project.organizationId,
        syncConfig: body.syncConfig,
      });
      if (isErr(config)) {
        return badRequestResponse(c, config.error.code, config.error.message);
      }
      const overlapping = await findOverlappingContentSyncAutomation({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
        syncConfig: config.value,
      });
      if (overlapping) {
        return conflictResponse(
          c,
          "content_sync_automation_overlap",
          "An active content sync automation already syncs this repository folder. Pause it first.",
          { automationId: overlapping.id },
        );
      }

      const sync = await saveProjectContentSync({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
        syncConfig: config.value,
        schedule: body.schedule,
        userId: c.var.auth.user.localUserId,
      });
      await recordSyncSettingsChange(c.var.auth, resolved.project.id);
      return c.json({ sync: serializeSync(sync) }, 200);
    })
    .delete("/", validateParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c.var.auth, c.req.valid("param").projectId);
      if (resolved.kind !== "ok") {
        return projectUnavailableResponse(c, resolved.kind);
      }

      const deleted = await deleteProjectContentSync({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
      });
      if (isErr(deleted)) {
        return deleted.error.code === "content_sync_in_progress"
          ? conflictResponse(c, deleted.error.code, "Wait for the running sync to finish")
          : notFoundResponse(c, deleted.error.code);
      }
      await recordSyncSettingsChange(c.var.auth, resolved.project.id);
      return c.body(null, 204);
    })
    .post("/runs", validateParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c.var.auth, c.req.valid("param").projectId);
      if (resolved.kind !== "ok") {
        return projectUnavailableResponse(c, resolved.kind);
      }

      const sync = await getProjectContentSync({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
      });
      if (!sync) {
        return notFoundResponse(c, "content_sync_not_found", "Save the sync settings first");
      }

      const result = await startProjectContentSyncRun({
        sync,
        trigger: "manual",
        userId: c.var.auth.user.localUserId,
        queue,
      });
      if (isErr(result)) {
        return conflictResponse(c, result.error.code, "A sync is already running");
      }
      return c.json({ run: serializeRun(result.value) }, 202);
    });
}
