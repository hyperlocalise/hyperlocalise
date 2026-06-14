import { randomUUID } from "node:crypto";

import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { isIntegrationsReadAllowed } from "@/api/auth/capability-guards";
import { isWorkspaceOperatorRole } from "@/api/auth/roles";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import {
  GITHUB_STATE_TTL_MS,
  getGitHubStateSecret,
  signGitHubState,
} from "@/lib/agents/github/oauth-state";
import { getGitHubApp } from "@/lib/agents/github/app";
import { syncInstallationRepositories } from "@/lib/agents/github/repositories";
import { createLogger } from "@/lib/log";

import { parseGithubRepositoryAutomationSettingsPartial } from "@/lib/agents/github/github-repository-automation-settings";
import {
  deleteGithubRepositoryAutomationSettings,
  getGithubRepositoryAutomationSettings,
  upsertGithubRepositoryAutomationSettings,
} from "@/lib/agents/github/github-repository-automation-settings-store";

import {
  githubRepositoryIdParamSchema,
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

export function createGithubInstallationRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
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
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
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
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

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
    .get("/repositories/:githubRepositoryId/automation-settings", async (c) => {
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
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
        if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
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
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
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
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
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
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
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
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
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
