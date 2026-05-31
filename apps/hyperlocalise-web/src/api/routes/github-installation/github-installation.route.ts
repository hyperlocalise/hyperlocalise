import { randomUUID } from "node:crypto";

import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { isAdminRole } from "@/api/auth/roles";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, notFoundResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import {
  cancelI18nSetupRun,
  findActiveI18nSetupRun,
  getI18nSetupRun,
  getLatestI18nSetupRun,
  serializeI18nSetupRun,
} from "@/lib/agents/i18n-setup/i18n-setup-runs";
import type { I18nSetupRequestedEventData } from "@/lib/agents/i18n-setup/i18n-setup-task";
import {
  GITHUB_STATE_TTL_MS,
  getGitHubStateSecret,
  signGitHubState,
} from "@/lib/agents/github/oauth-state";
import { getGitHubApp } from "@/lib/agents/github/app";
import { syncInstallationRepositories } from "@/lib/agents/github/repositories";
import { createLogger } from "@/lib/log";
import type { I18nSetupQueue } from "@/lib/workflow/types";
import { createI18nSetupQueue } from "@/workflows/adapters";

import { parseGithubRepositoryAutomationSettingsPartial } from "@/lib/agents/github/github-repository-automation-settings";
import {
  deleteGithubRepositoryAutomationSettings,
  getGithubRepositoryAutomationSettings,
  upsertGithubRepositoryAutomationSettings,
} from "@/lib/agents/github/github-repository-automation-settings-store";

import {
  githubRepositoryIdParamSchema,
  i18nSetupRunIdParamSchema,
  searchRepositoriesSchema,
  updateRepositoriesSchema,
  upsertGithubRepositoryAutomationSettingsBodySchema,
} from "./github-installation.schema";

const logger = createLogger("github-installation");

const validateRepositorySearch = validator("query", (value) => {
  const parsed = searchRepositoriesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
});

const validateUpdateRepositories = validator("json", (value, c) => {
  const parsed = updateRepositoriesSchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" as const }, 400);
  }

  return parsed.data;
});

const validateAutomationSettingsBody = validator("json", (value, c) => {
  const parsed = upsertGithubRepositoryAutomationSettingsBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_github_repository_automation_settings_payload" as const }, 400);
  }

  return parsed.data;
});

async function getOwnedRepository(input: { organizationId: string; githubRepositoryId: string }) {
  const [repository] = await db
    .select()
    .from(schema.githubInstallationRepositories)
    .where(
      and(
        eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
        eq(schema.githubInstallationRepositories.githubRepositoryId, input.githubRepositoryId),
      ),
    )
    .limit(1);

  return repository ?? null;
}

function mapAutomationSettingsError(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  if (error instanceof Error) {
    if (error.message === "automation_trigger_required") {
      return badRequestResponse(
        c,
        "automation_trigger_required",
        "Enable at least one workflow and choose a trigger mode.",
      );
    }
    if (error.message === "push_trigger_requires_branches") {
      return badRequestResponse(
        c,
        "push_trigger_requires_branches",
        "Push-triggered automation requires at least one branch pattern.",
      );
    }
    if (error.message === "weekly_schedule_requires_day_of_week") {
      return badRequestResponse(
        c,
        "weekly_schedule_requires_day_of_week",
        "Weekly schedules require a day of week between 0 (Sunday) and 6 (Saturday).",
      );
    }
    if (error.message === "invalid_automation_timezone") {
      return badRequestResponse(
        c,
        "invalid_automation_timezone",
        "Scheduled automation requires a valid IANA timezone.",
      );
    }
  }

  throw error;
}

type GithubInstallationRouteOptions = {
  i18nSetupQueue?: I18nSetupQueue;
};

export function createGithubInstallationRoutes(options: GithubInstallationRouteOptions = {}) {
  const i18nSetupQueue = options.i18nSetupQueue ?? createI18nSetupQueue();

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const [installation] = await db
        .select()
        .from(schema.githubInstallations)
        .where(
          eq(
            schema.githubInstallations.organizationId,
            c.var.auth.organization.localOrganizationId,
          ),
        )
        .limit(1);

      if (!installation) {
        return c.json({ installation: null }, 200);
      }

      const [total] = await db
        .select({ value: count() })
        .from(schema.githubInstallationRepositories)
        .where(
          eq(
            schema.githubInstallationRepositories.githubInstallationId,
            installation.githubInstallationId,
          ),
        );
      const [enabled] = await db
        .select({ value: count() })
        .from(schema.githubInstallationRepositories)
        .where(
          and(
            eq(
              schema.githubInstallationRepositories.githubInstallationId,
              installation.githubInstallationId,
            ),
            eq(schema.githubInstallationRepositories.enabled, true),
          ),
        );

      return c.json(
        {
          installation: {
            ...installation,
            repositoryCount: total?.value ?? 0,
            enabledRepositoryCount: enabled?.value ?? 0,
          },
        },
        200,
      );
    })
    .get("/install-url", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      if (!env.GITHUB_APP_ID || !env.GITHUB_APP_SLUG) {
        return c.json({ error: "github_app_not_configured" }, 503);
      }

      const slug = c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId;
      const nonce = randomUUID();
      const timestamp = Date.now();
      const payload = `${slug}:${timestamp}:${nonce}`;
      const secret = getGitHubStateSecret();
      const signature = await signGitHubState(payload, secret);
      const state = `${payload}:${signature}`;

      await db.insert(schema.githubInstallationStates).values({
        nonce,
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        expiresAt: new Date(timestamp + GITHUB_STATE_TTL_MS),
      });

      // TODO: support custom GitHub App URLs (e.g. GitHub Enterprise).
      const url = new URL(`https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`);
      url.searchParams.set("state", state);

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          organizationSlug: slug,
          userId: c.var.auth.user.localUserId,
        },
        "minted github app install url",
      );

      return c.json({ url: url.toString() }, 200);
    })
    .get("/repositories", validateRepositorySearch, async (c) => {
      const organizationId = c.var.auth.organization.localOrganizationId;
      const query = c.req.valid("query").q?.trim();
      const conditions = [eq(schema.githubInstallationRepositories.organizationId, organizationId)];
      if (query) {
        conditions.push(ilike(schema.githubInstallationRepositories.fullName, `%${query}%`));
      }

      const repositories = await db
        .select()
        .from(schema.githubInstallationRepositories)
        .where(and(...conditions))
        .orderBy(schema.githubInstallationRepositories.fullName);

      return c.json({ repositories }, 200);
    })
    .post("/repositories/:githubRepositoryId/i18n-setup", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const parsedParams = githubRepositoryIdParamSchema.safeParse(c.req.param());
      if (!parsedParams.success) {
        return badRequestResponse(c, "invalid_github_repository_id");
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const { githubRepositoryId } = parsedParams.data;

      const [installation] = await db
        .select()
        .from(schema.githubInstallations)
        .where(eq(schema.githubInstallations.organizationId, organizationId))
        .limit(1);

      if (!installation) {
        return notFoundResponse(c, "github_installation_not_found");
      }

      const [repository] = await db
        .select()
        .from(schema.githubInstallationRepositories)
        .where(
          and(
            eq(schema.githubInstallationRepositories.organizationId, organizationId),
            eq(schema.githubInstallationRepositories.githubRepositoryId, githubRepositoryId),
          ),
        )
        .limit(1);

      if (!repository) {
        return notFoundResponse(c, "github_repository_not_found");
      }

      if (!repository.enabled) {
        return badRequestResponse(
          c,
          "github_repository_not_enabled",
          "Enable this repository before running the i18n setup wizard.",
        );
      }

      if (repository.archived) {
        return badRequestResponse(
          c,
          "github_repository_archived",
          "Cannot run the i18n setup wizard on an archived repository.",
        );
      }

      const activeRun = await findActiveI18nSetupRun({
        organizationId,
        githubRepositoryId,
      });

      if (activeRun) {
        return c.json({ i18nSetupRun: activeRun }, 200);
      }

      const baseBranch = repository.defaultBranch ?? "main";
      const runId = randomUUID();
      const [owner, repoName] = repository.fullName.split("/");
      if (!owner || !repoName) {
        return badRequestResponse(c, "invalid_repository_full_name");
      }

      const [createdRun] = await db
        .insert(schema.githubI18nSetupRuns)
        .values({
          id: runId,
          organizationId,
          actorUserId: c.var.auth.user.localUserId,
          githubInstallationId: installation.githubInstallationId,
          githubRepositoryId: repository.githubRepositoryId,
          repositoryFullName: repository.fullName,
          baseBranch,
          status: "queued",
        })
        .returning();

      const event: I18nSetupRequestedEventData = {
        runId,
        organizationId,
        actorUserId: c.var.auth.user.localUserId,
        installationId: Number.parseInt(installation.githubInstallationId, 10),
        repositoryOwner: owner,
        repositoryName: repoName,
        repositoryFullName: repository.fullName,
        githubRepositoryId: repository.githubRepositoryId,
        baseBranch,
      };

      try {
        const queued = await i18nSetupQueue.enqueue(event);
        const [updatedRun] = await db
          .update(schema.githubI18nSetupRuns)
          .set({
            workflowRunId: queued.ids[0] ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.githubI18nSetupRuns.id, runId))
          .returning();

        return c.json({ i18nSetupRun: serializeI18nSetupRun(updatedRun ?? createdRun) }, 202);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db
          .update(schema.githubI18nSetupRuns)
          .set({
            status: "failed",
            errorCode: "i18n_setup_enqueue_failed",
            errorMessage: message,
            updatedAt: new Date(),
          })
          .where(eq(schema.githubI18nSetupRuns.id, runId));

        return c.json(
          {
            error: "i18n_setup_enqueue_failed",
            message: "Could not start the i18n setup wizard.",
          },
          502,
        );
      }
    })
    .get("/repositories/:githubRepositoryId/i18n-setup-runs/latest", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const parsedParams = githubRepositoryIdParamSchema.safeParse(c.req.param());
      if (!parsedParams.success) {
        return badRequestResponse(c, "invalid_github_repository_id");
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const latestRun = await getLatestI18nSetupRun({
        organizationId,
        githubRepositoryId: parsedParams.data.githubRepositoryId,
      });

      return c.json({ i18nSetupRun: latestRun }, 200);
    })
    .get("/i18n-setup-runs/:runId", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const parsedParams = i18nSetupRunIdParamSchema.safeParse(c.req.param());
      if (!parsedParams.success) {
        return badRequestResponse(c, "invalid_i18n_setup_run_id");
      }

      const run = await getI18nSetupRun({
        organizationId: c.var.auth.organization.localOrganizationId,
        runId: parsedParams.data.runId,
      });

      if (!run) {
        return notFoundResponse(c, "i18n_setup_run_not_found");
      }

      return c.json({ i18nSetupRun: run }, 200);
    })
    .post("/i18n-setup-runs/:runId/cancel", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const parsedParams = i18nSetupRunIdParamSchema.safeParse(c.req.param());
      if (!parsedParams.success) {
        return badRequestResponse(c, "invalid_i18n_setup_run_id");
      }

      const run = await cancelI18nSetupRun({
        organizationId: c.var.auth.organization.localOrganizationId,
        runId: parsedParams.data.runId,
      });

      if (!run) {
        return notFoundResponse(c, "i18n_setup_run_not_found");
      }

      return c.json({ i18nSetupRun: run }, 200);
    })
    .get("/repositories/:githubRepositoryId/automation-settings", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const parsedParams = githubRepositoryIdParamSchema.safeParse(c.req.param());
      if (!parsedParams.success) {
        return badRequestResponse(c, "invalid_github_repository_id");
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const repository = await getOwnedRepository({
        organizationId,
        githubRepositoryId: parsedParams.data.githubRepositoryId,
      });

      if (!repository) {
        return notFoundResponse(c, "github_repository_not_found");
      }

      const record = await getGithubRepositoryAutomationSettings({
        githubInstallationRepositoryId: repository.id,
        githubRepositoryId: repository.githubRepositoryId,
      });

      return c.json({ githubRepositoryAutomationSettings: record }, 200);
    })
    .put(
      "/repositories/:githubRepositoryId/automation-settings",
      validateAutomationSettingsBody,
      async (c) => {
        if (!isAdminRole(c.var.auth.membership.role)) {
          return c.json({ error: "forbidden" }, 403);
        }

        const parsedParams = githubRepositoryIdParamSchema.safeParse(c.req.param());
        if (!parsedParams.success) {
          return badRequestResponse(c, "invalid_github_repository_id");
        }

        const organizationId = c.var.auth.organization.localOrganizationId;
        const repository = await getOwnedRepository({
          organizationId,
          githubRepositoryId: parsedParams.data.githubRepositoryId,
        });

        if (!repository) {
          return notFoundResponse(c, "github_repository_not_found");
        }

        if (!repository.enabled) {
          return badRequestResponse(
            c,
            "github_repository_not_enabled",
            "Enable this repository before configuring automation.",
          );
        }

        if (repository.archived) {
          return badRequestResponse(
            c,
            "github_repository_archived",
            "Cannot configure automation for an archived repository.",
          );
        }

        try {
          const payload = c.req.valid("json");
          const record = await upsertGithubRepositoryAutomationSettings({
            organizationId,
            githubInstallationRepositoryId: repository.id,
            githubRepositoryId: repository.githubRepositoryId,
            settings: parseGithubRepositoryAutomationSettingsPartial(payload.settings),
          });

          return c.json({ githubRepositoryAutomationSettings: record }, 200);
        } catch (error) {
          return mapAutomationSettingsError(c, error);
        }
      },
    )
    .delete("/repositories/:githubRepositoryId/automation-settings", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const parsedParams = githubRepositoryIdParamSchema.safeParse(c.req.param());
      if (!parsedParams.success) {
        return badRequestResponse(c, "invalid_github_repository_id");
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const repository = await getOwnedRepository({
        organizationId,
        githubRepositoryId: parsedParams.data.githubRepositoryId,
      });

      if (!repository) {
        return notFoundResponse(c, "github_repository_not_found");
      }

      const record = await deleteGithubRepositoryAutomationSettings({
        githubInstallationRepositoryId: repository.id,
        githubRepositoryId: repository.githubRepositoryId,
      });

      return c.json({ githubRepositoryAutomationSettings: record }, 200);
    })
    .patch("/repositories", validateUpdateRepositories, async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const enabledRepositoryIds = [...new Set(c.req.valid("json").enabledRepositoryIds)];

      await db.transaction(async (tx) => {
        await tx
          .update(schema.githubInstallationRepositories)
          .set({ enabled: false, updatedAt: new Date() })
          .where(eq(schema.githubInstallationRepositories.organizationId, organizationId));

        if (enabledRepositoryIds.length > 0) {
          await tx
            .update(schema.githubInstallationRepositories)
            .set({ enabled: true, updatedAt: new Date() })
            .where(
              and(
                eq(schema.githubInstallationRepositories.organizationId, organizationId),
                inArray(
                  schema.githubInstallationRepositories.githubRepositoryId,
                  enabledRepositoryIds,
                ),
              ),
            );
        }
      });

      const repositories = await db
        .select()
        .from(schema.githubInstallationRepositories)
        .where(eq(schema.githubInstallationRepositories.organizationId, organizationId))
        .orderBy(schema.githubInstallationRepositories.fullName);

      return c.json({ repositories }, 200);
    })
    .post("/repositories/sync", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const [installation] = await db
        .select()
        .from(schema.githubInstallations)
        .where(
          eq(
            schema.githubInstallations.organizationId,
            c.var.auth.organization.localOrganizationId,
          ),
        )
        .limit(1);

      if (!installation) {
        return c.json({ error: "github_installation_not_found" }, 404);
      }

      const repositories = await syncInstallationRepositories({
        organizationId: installation.organizationId,
        githubInstallationId: installation.githubInstallationId,
      });

      return c.json({ syncedRepositoryCount: repositories.length }, 200);
    })
    .delete("/", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const [installation] = await db
        .select({
          id: schema.githubInstallations.id,
          githubInstallationId: schema.githubInstallations.githubInstallationId,
        })
        .from(schema.githubInstallations)
        .where(eq(schema.githubInstallations.organizationId, organizationId))
        .limit(1);

      if (!installation) {
        return c.json({ error: "github_installation_not_found" }, 404);
      }

      try {
        await getGitHubApp().octokit.request("DELETE /app/installations/{installation_id}", {
          installation_id: Number.parseInt(installation.githubInstallationId, 10),
        });
      } catch (error) {
        if (
          !(
            typeof error === "object" &&
            error !== null &&
            "status" in error &&
            (error.status === 404 || error.status === 410)
          )
        ) {
          console.error("GitHub installation revocation failed", error);
          return c.json({ error: "github_installation_revoke_failed" }, 502);
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(schema.githubInstallationRepositories)
          .where(
            and(
              eq(schema.githubInstallationRepositories.organizationId, organizationId),
              eq(
                schema.githubInstallationRepositories.githubInstallationId,
                installation.githubInstallationId,
              ),
            ),
          );

        await tx
          .delete(schema.githubInstallations)
          .where(eq(schema.githubInstallations.id, installation.id));
      });

      return c.body(null, 204);
    });
}

export const githubInstallationRoutes = createGithubInstallationRoutes();
