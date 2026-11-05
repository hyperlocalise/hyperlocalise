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
import { getGitLabProject, listGitLabMembershipProjects } from "@/lib/gitlab/client";
import { listGitLabConnections, loadGitLabConnectionCredentials } from "@/lib/gitlab/connections";
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
/** Enough to say which keys went, without sending a whole repository's report per run. */
const HIDDEN_KEY_FILE_LIMIT = 20;
const HIDDEN_KEY_LIMIT = 20;

const validateConnectionsQuery = validator("query", (value, c) => {
  const parsed = z
    .object({ gitlabConnectionId: z.string().uuid().optional() })
    .safeParse({ gitlabConnectionId: value.gitlabConnectionId || undefined });
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_content_sync_connections_query",
      "Invalid GitLab connection",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

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

/** Why a GitLab run sent nothing back, when GitLab refused the write. */
function readPushError(pushed: unknown): { code: string; message: string } | null {
  const error = pushed && typeof pushed === "object" && "error" in pushed ? pushed.error : null;
  if (!error || typeof error !== "object") {
    return null;
  }
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string" ? { code, message } : null;
}

/** Per file, the keys a GitLab run hid because the repository no longer has them. */
function readHiddenKeys(pulled: unknown) {
  const files =
    pulled && typeof pulled === "object" && "files" in pulled && Array.isArray(pulled.files)
      ? (pulled.files as unknown[])
      : [];
  return files.flatMap((file) => {
    if (!file || typeof file !== "object") {
      return [];
    }
    const { path, missingKeys, missingKeyCount } = file as {
      path?: unknown;
      missingKeys?: unknown;
      missingKeyCount?: unknown;
    };
    if (typeof path !== "string" || !Array.isArray(missingKeys)) {
      return [];
    }
    const keys = missingKeys.filter((key): key is string => typeof key === "string");
    // The stored list is capped; the count says how many there really were.
    const keyCount = typeof missingKeyCount === "number" ? missingKeyCount : keys.length;
    return keys.length > 0 ? [{ path, keys: keys.slice(0, HIDDEN_KEY_LIMIT), keyCount }] : [];
  });
}

function syncProvider(sync: { syncConfig: Record<string, unknown> } | null): "github" | "gitlab" {
  return sync?.syncConfig.provider === "gitlab" ? "gitlab" : "github";
}

/** The saved GitLab project, so the connections list can include it even past the listing's cap. */
function savedGitLabProject(sync: { syncConfig: Record<string, unknown> } | null) {
  const { provider, resourceKey, connectionId } = sync?.syncConfig ?? {};
  return provider === "gitlab" &&
    typeof resourceKey === "string" &&
    typeof connectionId === "string"
    ? { connectionId, resourceKey }
    : undefined;
}

function serializeRun(run: ProjectContentSyncRunRow, syncProvider: "github" | "gitlab") {
  const pulled = run.summary?.pulled;
  const pushed = run.summary?.pushed;
  // Recorded with the run since the sync can move between services; older runs follow the sync.
  const provider = run.summary?.provider;
  const pullRequestUrl =
    pushed && typeof pushed === "object" && "pullRequestUrl" in pushed
      ? pushed.pullRequestUrl
      : null;
  return {
    id: run.id,
    provider: provider === "github" || provider === "gitlab" ? provider : syncProvider,
    trigger: run.trigger,
    status: run.status,
    // A failed run may carry only the service it ran with.
    pulled: pulled
      ? {
          uploaded: readSummaryCount(pulled, "uploaded"),
          skipped: readSummaryCount(pulled, "skipped"),
          failed: readSummaryCount(pulled, "failed"),
          unmatched: readSummaryCount(pulled, "unmatched"),
        }
      : null,
    hiddenKeys: readHiddenKeys(pulled).slice(0, HIDDEN_KEY_FILE_LIMIT),
    written: pushed ? readSummaryCount(pushed, "written") : null,
    heldBack: pushed ? readSummaryCount(pushed, "heldBack") : null,
    listsHeldBack: pushed ? readSummaryCount(pushed, "listsHeldBack") : null,
    notSent: pushed
      ? readSummaryCount(pushed, "unsupported") + readSummaryCount(pushed, "unreadable")
      : null,
    conflicts: pushed ? readSummaryCount(pushed, "conflicts") : null,
    pushError: readPushError(pushed),
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

const GITLAB_NOT_CONNECTED_ERROR: SyncConnectionError = {
  code: "content_sync_gitlab_not_connected",
  message: "Connect the workspace's GitLab server in Integrations first.",
};

const GITLAB_TOKEN_UNREADABLE_ERROR: SyncConnectionError = {
  code: "content_sync_gitlab_token_unreadable",
  message:
    "The workspace's saved GitLab token can't be read. Save the connection again in Integrations.",
};

const GITLAB_PROJECT_NOT_FOUND_ERROR: SyncConnectionError = {
  code: "content_sync_gitlab_project_not_found",
  message: "The workspace's GitLab token can't see this repository. Choose it again.",
};

const GITLAB_UNREACHABLE_ERROR: SyncConnectionError = {
  code: "content_sync_gitlab_unavailable",
  message: "The workspace's GitLab server couldn't be reached. Try again or check Integrations.",
};

const GITLAB_CONNECTION_REMOVED_ERROR: SyncConnectionError = {
  code: "content_sync_gitlab_connection_removed",
  message: "The chosen GitLab connection no longer exists. Choose another connection.",
};

type SyncConnectionOption = {
  provider: "github" | "gitlab";
  connectionId: string;
  resourceKey: string;
  /** The branch a GitHub repository was enabled with; a GitLab sync names its own. */
  branch: string | null;
};

type GitLabSyncListing = {
  /** Whether the workspace has any GitLab connection. */
  connected: boolean;
  /** Whether the chosen connection's projects could be read. */
  available: boolean;
  /** The connection the projects belong to: the one asked for, else the default. */
  connectionId: string | null;
  connections: SyncConnectionOption[];
};

/**
 * One GitLab connection's projects; `available` is false when GitLab can't be read. The listing
 * stops at the most recently active few hundred, so a saved project outside them is looked up
 * by its path and added, rather than being called missing.
 */
async function listGitLabSyncConnections(
  organizationId: string,
  gitlabConnectionId: string | null,
  saved?: { connectionId: string; resourceKey: string },
): Promise<GitLabSyncListing> {
  const access = await loadGitLabConnectionCredentials({
    organizationId,
    connectionId: gitlabConnectionId,
  });
  if (isErr(access)) {
    return { connected: true, available: false, connectionId: gitlabConnectionId, connections: [] };
  }
  if (!access.value) {
    // A removed connection still counts the workspace as connected when another exists.
    const connected = gitlabConnectionId
      ? (await listGitLabConnections({ organizationId })).length > 0
      : false;
    return { connected, available: false, connectionId: gitlabConnectionId, connections: [] };
  }
  const connectionId = access.value.id;
  const projects = await listGitLabMembershipProjects(access.value);
  if (isErr(projects)) {
    return { connected: true, available: false, connectionId, connections: [] };
  }
  const listed = projects.value;
  if (saved && !listed.some((project) => String(project.id) === saved.connectionId)) {
    const found = await getGitLabProject({ ...access.value, pathWithNamespace: saved.resourceKey });
    if (isErr(found)) {
      if (found.error.code !== "gitlab_not_found") {
        // A slow or failing lookup must not call the saved project missing.
        return { connected: true, available: false, connectionId, connections: [] };
      }
    } else if (String(found.value.id) === saved.connectionId && !found.value.archived) {
      // The same project, outside the most recently active ones the listing stops at.
      listed.push(found.value);
    }
  }
  return {
    connected: true,
    available: true,
    connectionId,
    connections: listed
      .map((project) => ({
        provider: "gitlab" as const,
        connectionId: String(project.id),
        resourceKey: project.pathWithNamespace,
        // What an empty branch field reads; shown as its placeholder.
        branch: project.defaultBranch,
      }))
      .sort((left, right) => left.resourceKey.localeCompare(right.resourceKey)),
  };
}

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
      // A GitHub sync reads the repository's default branch and every file in the folder, so
      // a branch or language file paths sent for it would only mislead the panel.
      const { branch: _branch, pathTemplate: _pathTemplate, ...github } = config;
      return ok({ ...github, resourceKey: repository.fullName });
    }
    case "gitlab": {
      // Syncs run with one of the workspace's own GitLab connections, never a member's
      // GitLab.com sign-in: the one chosen, else the default, whose id is then kept.
      const access = await loadGitLabConnectionCredentials({
        organizationId: input.organizationId,
        connectionId: config.gitlabConnectionId,
      });
      if (isErr(access)) {
        return err(GITLAB_TOKEN_UNREADABLE_ERROR);
      }
      if (!access.value) {
        return err(
          config.gitlabConnectionId ? GITLAB_CONNECTION_REMOVED_ERROR : GITLAB_NOT_CONNECTED_ERROR,
        );
      }
      // The path is what runs look up; the id proves it still names the project that was chosen.
      const project = await getGitLabProject({
        ...access.value,
        pathWithNamespace: config.resourceKey,
      });
      if (isErr(project)) {
        return err(
          project.error.code === "gitlab_not_found"
            ? GITLAB_PROJECT_NOT_FOUND_ERROR
            : GITLAB_UNREACHABLE_ERROR,
        );
      }
      if (String(project.value.id) !== config.connectionId || project.value.archived) {
        return err(GITLAB_PROJECT_NOT_FOUND_ERROR);
      }
      return ok({
        ...config,
        resourceKey: project.value.pathWithNamespace,
        gitlabConnectionId: access.value.id,
      });
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
            runs: runs.map((run) => serializeRun(run, syncProvider(sync))),
          },
        },
        200,
      );
    })
    .get("/connections", validateParams, validateConnectionsQuery, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const resolved = await requireNativeProject(c.var.auth, c.req.valid("param").projectId);
      if (resolved.kind !== "ok") {
        return projectUnavailableResponse(c, resolved.kind);
      }

      const repositories = await db
        .select({
          id: schema.githubInstallationRepositories.id,
          fullName: schema.githubInstallationRepositories.fullName,
          defaultBranch: schema.githubInstallationRepositories.defaultBranch,
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
      const saved = await getProjectContentSync({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
      });
      // The projects of the connection asked for, else the saved sync's, else the default.
      const savedConnectionId =
        saved?.syncConfig.provider === "gitlab" &&
        typeof saved.syncConfig.gitlabConnectionId === "string"
          ? saved.syncConfig.gitlabConnectionId
          : null;
      const askedConnectionId = c.req.valid("query").gitlabConnectionId ?? savedConnectionId;
      const [gitlab, gitlabConnections] = await Promise.all([
        listGitLabSyncConnections(
          resolved.project.organizationId,
          askedConnectionId,
          savedGitLabProject(saved),
        ),
        listGitLabConnections({ organizationId: resolved.project.organizationId }),
      ]);

      const connections: SyncConnectionOption[] = [
        ...repositories.map((repository) => ({
          provider: "github" as const,
          connectionId: repository.id,
          resourceKey: repository.fullName,
          branch: repository.defaultBranch,
        })),
        ...gitlab.connections,
      ];
      return c.json(
        {
          connections,
          gitlab: {
            connected: gitlab.connected,
            available: gitlab.available,
            connectionId: gitlab.connectionId,
          },
          gitlabConnections: gitlabConnections.map((connection) => ({
            id: connection.id,
            name: connection.name,
            serverUrl: connection.serverUrl,
            isDefault: connection.isDefault,
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
      // GitHub repositories sync from their Automation settings in Integrations for now, which a
      // new GitHub sync here would duplicate; one saved before then can still be changed.
      if (body.syncConfig.provider === "github") {
        const existing = await getProjectContentSync({
          organizationId: resolved.project.organizationId,
          projectId: resolved.project.id,
        });
        if (!existing || syncProvider(existing) !== "github") {
          return badRequestResponse(
            c,
            "content_sync_github_in_integrations",
            "Sync a GitHub repository from its Automation settings in Integrations.",
          );
        }
      }
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
      return c.json({ run: serializeRun(result.value, syncProvider(sync)) }, 202);
    });
}
