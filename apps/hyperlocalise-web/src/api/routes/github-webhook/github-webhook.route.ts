import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

import { db, schema } from "@/lib/database";
import { getGitHubApp } from "@/lib/agents/github/app";
import { createLogger } from "@/lib/log";
import { getGitHubBot } from "@/lib/agents/github/bot";
import {
  type GitHubRepositorySyncRecord,
  normalizeGitHubRepository,
  removeGitHubInstallationRepositories,
  upsertGitHubInstallationRepositories,
} from "@/lib/agents/github/repositories";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import type { GitHubFixQueue } from "@/lib/workflow/types";
import { createGitHubFixQueue } from "@/workflows/adapters";

const logger = createLogger("github-webhook");

type GithubWebhookHandler = (request: Request) => Promise<Response>;

type CreateGithubWebhookRoutesOptions = {
  githubFixQueue?: GitHubFixQueue;
  githubWebhookHandler?: GithubWebhookHandler;
};

async function defaultGithubWebhookHandler(queue: GitHubFixQueue) {
  const bot = await getGitHubBot({ githubFixQueue: queue });
  const handler = bot.webhooks.github;
  if (!handler) {
    return null;
  }

  return handler;
}

type GitHubWebhookRepository = {
  id: number;
  name: string;
  full_name: string;
  private?: boolean;
  archived?: boolean;
  default_branch?: string | null;
  owner?: { login?: string } | null;
};

type GitHubWebhookPayload = {
  action?: string;
  installation?: { id: number };
  repository?: GitHubWebhookRepository;
  repositories_added?: GitHubWebhookRepository[];
  repositories_removed?: GitHubWebhookRepository[];
};

async function verifyGitHubWebhookSignature(bodyText: string, signature: string | undefined) {
  if (!signature) {
    logger.warn("missing webhook signature");
    return false;
  }

  try {
    return await getGitHubApp().webhooks.verify(bodyText, signature);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "webhook signature verification failed",
    );
    return false;
  }
}

async function findStoredInstallation(githubInstallationId: string) {
  const [installation] = await db
    .select()
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.githubInstallationId, githubInstallationId))
    .limit(1);

  return installation ?? null;
}

async function isRepositoryEnabled(input: {
  githubInstallationId: string;
  githubRepositoryId: string;
}) {
  const [repository] = await db
    .select({ id: schema.githubInstallationRepositories.id })
    .from(schema.githubInstallationRepositories)
    .where(
      and(
        eq(schema.githubInstallationRepositories.githubInstallationId, input.githubInstallationId),
        eq(schema.githubInstallationRepositories.githubRepositoryId, input.githubRepositoryId),
        eq(schema.githubInstallationRepositories.enabled, true),
      ),
    )
    .limit(1);

  return Boolean(repository);
}

async function applyRepositoryWebhook(payload: GitHubWebhookPayload) {
  if (!payload.installation?.id) {
    return;
  }

  const installation = await findStoredInstallation(String(payload.installation.id));
  if (!installation) {
    return;
  }

  if (payload.repository && payload.action !== "deleted") {
    const repository = normalizeGitHubRepository(payload.repository);
    if (repository) {
      await upsertGitHubInstallationRepositories({
        organizationId: installation.organizationId,
        githubInstallationId: installation.githubInstallationId,
        repositories: [repository],
      });
    }
  }

  if (payload.repository && payload.action === "deleted") {
    await removeGitHubInstallationRepositories({
      githubInstallationId: installation.githubInstallationId,
      githubRepositoryIds: [String(payload.repository.id)],
    });
  }

  const added = (payload.repositories_added ?? [])
    .map((repository) => normalizeGitHubRepository(repository))
    .filter((repository): repository is GitHubRepositorySyncRecord => repository !== null);
  if (added.length > 0) {
    await upsertGitHubInstallationRepositories({
      organizationId: installation.organizationId,
      githubInstallationId: installation.githubInstallationId,
      repositories: added,
    });
  }

  await removeGitHubInstallationRepositories({
    githubInstallationId: installation.githubInstallationId,
    githubRepositoryIds: (payload.repositories_removed ?? []).map((repository) =>
      String(repository.id),
    ),
  });
}

export function createGithubWebhookRoutes(options: CreateGithubWebhookRoutesOptions = {}) {
  return new Hono().post("/", async (c) => {
    const event = c.req.header("x-github-event");
    const delivery = c.req.header("x-github-delivery");

    const bodyBuffer = await c.req.raw.arrayBuffer();
    const bodyText = new TextDecoder().decode(bodyBuffer);

    const parseResult = safeJsonParse(bodyText);
    if (!parseResult.ok) {
      logger.warn({ delivery, event }, "invalid webhook payload");
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = parseResult.value as GitHubWebhookPayload;

    logger.info(
      {
        delivery,
        event,
        action: payload.action,
        installationId: payload.installation?.id,
        repository: payload.repository?.full_name,
      },
      "webhook received",
    );

    if (!options.githubWebhookHandler) {
      const verified = await verifyGitHubWebhookSignature(
        bodyText,
        c.req.header("x-hub-signature-256"),
      );
      if (!verified) {
        logger.warn({ delivery, event }, "invalid webhook signature");
        return c.json({ error: "invalid_signature" }, 401);
      }
    }

    if (event === "installation" && payload.action === "deleted" && payload.installation?.id) {
      logger.info({ installationId: payload.installation.id }, "deleting github installation");
      await db
        .delete(schema.githubInstallations)
        .where(
          eq(schema.githubInstallations.githubInstallationId, String(payload.installation.id)),
        );

      return c.json({ ok: true, ignored: false }, 200);
    }

    if (event === "installation_repositories" || event === "repository") {
      logger.info(
        {
          installationId: payload.installation?.id,
          repositoriesAdded: payload.repositories_added?.length ?? 0,
          repositoriesRemoved: payload.repositories_removed?.length ?? 0,
          repository: payload.repository?.full_name,
          action: payload.action,
        },
        "applying repository webhook",
      );
      await applyRepositoryWebhook(payload);
      return c.json({ ok: true, ignored: false }, 200);
    }

    if (!payload.installation?.id) {
      logger.info({ delivery, event }, "ignoring webhook: no installation id");
      return c.json({ ok: true, ignored: true }, 200);
    }

    const installation = await findStoredInstallation(String(payload.installation.id));
    if (!installation) {
      logger.info(
        { installationId: payload.installation.id },
        "ignoring webhook: installation not found",
      );
      return c.json({ ok: true, ignored: true }, 200);
    }

    if (!payload.repository?.id) {
      logger.info(
        { installationId: payload.installation.id, event },
        "ignoring webhook: no repository id",
      );
      return c.json({ ok: true, ignored: true }, 200);
    }

    const enabled = await isRepositoryEnabled({
      githubInstallationId: installation.githubInstallationId,
      githubRepositoryId: String(payload.repository.id),
    });
    if (!enabled) {
      logger.info(
        {
          installationId: installation.githubInstallationId,
          repositoryId: payload.repository.id,
          repository: payload.repository.full_name,
        },
        "ignoring webhook: repository not enabled",
      );
      return c.json({ ok: true, ignored: true }, 200);
    }

    const handler =
      options.githubWebhookHandler ??
      (await defaultGithubWebhookHandler(options.githubFixQueue ?? createGitHubFixQueue()));

    if (!handler) {
      logger.error("github adapter not configured");
      return c.json({ error: "github_adapter_not_configured" }, 503);
    }

    // Reconstruct the request so the adapter can verify the webhook signature.
    const request = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
      body: bodyBuffer,
    });

    try {
      const response = await handler(request);
      logger.info({ delivery, event, status: response.status }, "webhook processed");
      return response;
    } catch (error) {
      logger.error(
        {
          delivery,
          event,
          error: error instanceof Error ? error.message : String(error),
        },
        "webhook handler failed",
      );
      throw error;
    }
  });
}
