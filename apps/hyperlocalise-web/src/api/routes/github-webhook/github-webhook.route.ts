import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

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
import {
  handleGithubPushWebhook,
  type GitHubPushWebhookPayload,
} from "@/lib/agents/github/github-push-webhook";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";

const logger = createLogger("github-webhook");

type GithubWebhookHandler = (request: Request) => Promise<Response>;

type CreateGithubWebhookRoutesOptions = {
  githubWebhookHandler?: GithubWebhookHandler;
};

async function defaultGithubWebhookHandler() {
  const bot = await getGitHubBot();
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

async function verifyGitHubWebhookSignature(
  bodyText: string,
  signature: string | undefined,
  log = logger,
) {
  if (!signature) {
    log.warn("missing webhook signature");
    return false;
  }

  try {
    return await getGitHubApp().webhooks.verify(bodyText, signature);
  } catch (error) {
    log.error(
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
  organizationId: string;
  githubInstallationId: string;
  githubRepositoryId: string;
}) {
  const [repository] = await db
    .select({ id: schema.githubInstallationRepositories.id })
    .from(schema.githubInstallationRepositories)
    .where(
      and(
        eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
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
  return new Hono().post(
    "/",
    bodyLimit({
      maxSize: 1024 * 1024, // 1MB
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      const event = c.req.header("x-github-event");
      const delivery = c.req.header("x-github-delivery");
      const log = logger.child({ delivery, event });

      const bodyBuffer = await c.req.raw.arrayBuffer();
      const bodyText = new TextDecoder().decode(bodyBuffer);

      const parseResult = safeJsonParse(bodyText);
      if (!parseResult.ok) {
        log.warn("invalid webhook payload");
        return c.json({ error: "invalid_payload" }, 400);
      }
      const payload = parseResult.value as GitHubWebhookPayload;

      log.info(
        {
          action: payload.action,
          installationId: payload.installation?.id,
        },
        "webhook received",
      );

      if (!options.githubWebhookHandler) {
        const verified = await verifyGitHubWebhookSignature(
          bodyText,
          c.req.header("x-hub-signature-256"),
          log,
        );
        if (!verified) {
          log.warn("invalid webhook signature");
          return c.json({ error: "invalid_signature" }, 401);
        }
      }

      if (event === "installation" && payload.action === "deleted" && payload.installation?.id) {
        log.info({ installationId: payload.installation.id }, "deleting github installation");
        await db
          .delete(schema.githubInstallations)
          .where(
            eq(schema.githubInstallations.githubInstallationId, String(payload.installation.id)),
          );

        return c.json({ ok: true, ignored: false }, 200);
      }

      if (event === "installation_repositories" || event === "repository") {
        log.info(
          {
            installationId: payload.installation?.id,
            repositoriesAdded: payload.repositories_added?.length ?? 0,
            repositoriesRemoved: payload.repositories_removed?.length ?? 0,
            action: payload.action,
          },
          "applying repository webhook",
        );
        await applyRepositoryWebhook(payload);
        return c.json({ ok: true, ignored: false }, 200);
      }

      if (!payload.installation?.id) {
        log.info("ignoring webhook: no installation id");
        return c.json({ ok: true, ignored: true }, 200);
      }

      const installation = await findStoredInstallation(String(payload.installation.id));
      if (!installation) {
        log.info(
          { installationId: payload.installation.id },
          "ignoring webhook: installation not found",
        );
        return c.json({ ok: true, ignored: true }, 200);
      }

      if (!payload.repository?.id) {
        log.info({ installationId: payload.installation.id }, "ignoring webhook: no repository id");
        return c.json({ ok: true, ignored: true }, 200);
      }

      const enabled = await isRepositoryEnabled({
        organizationId: installation.organizationId,
        githubInstallationId: installation.githubInstallationId,
        githubRepositoryId: String(payload.repository.id),
      });
      if (!enabled) {
        log.info(
          {
            installationId: installation.githubInstallationId,
            repositoryId: payload.repository.id,
          },
          "ignoring webhook: repository not enabled",
        );
        return c.json({ ok: true, ignored: true }, 200);
      }

      if (event === "push") {
        if (!delivery) {
          log.warn("push webhook missing delivery id");
          return c.json({ error: "missing_github_delivery_id" }, 400);
        }

        const [installationRepository] = await db
          .select({ id: schema.githubInstallationRepositories.id })
          .from(schema.githubInstallationRepositories)
          .where(
            and(
              eq(schema.githubInstallationRepositories.organizationId, installation.organizationId),
              eq(
                schema.githubInstallationRepositories.githubInstallationId,
                installation.githubInstallationId,
              ),
              eq(
                schema.githubInstallationRepositories.githubRepositoryId,
                String(payload.repository.id),
              ),
            ),
          )
          .limit(1);

        if (!installationRepository) {
          log.info(
            {
              installationId: installation.githubInstallationId,
              repositoryId: payload.repository.id,
            },
            "ignoring push webhook: installation repository not found",
          );
          return c.json({ ok: true, ignored: true }, 200);
        }

        const pushResult = await handleGithubPushWebhook({
          deliveryId: delivery,
          organizationId: installation.organizationId,
          githubInstallationId: installation.githubInstallationId,
          githubInstallationRepositoryId: installationRepository.id,
          githubRepositoryId: String(payload.repository.id),
          payload: payload as GitHubPushWebhookPayload,
        });

        if (pushResult.ignored) {
          return c.json({ ok: true, ignored: true }, 200);
        }

        return c.json(
          {
            ok: true,
            ignored: false,
            automation: pushResult.automation,
          },
          200,
        );
      }

      const handler = options.githubWebhookHandler ?? (await defaultGithubWebhookHandler());

      if (!handler) {
        log.error("github adapter not configured");
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
        log.info({ status: response.status }, "webhook processed");
        return response;
      } catch (error) {
        log.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          "webhook handler failed",
        );
        throw error;
      }
    },
  );
}
