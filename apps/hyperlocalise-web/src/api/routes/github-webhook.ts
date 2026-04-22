import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db, schema } from "@/lib/database";
import { getGitHubBot } from "@/lib/github-bot";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import type { GitHubFixQueue } from "@/lib/workflow/types";
import { createGitHubFixQueue } from "@/workflows/adapters";

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

export function createGithubWebhookRoutes(options: CreateGithubWebhookRoutesOptions = {}) {
  return new Hono().post("/", async (c) => {
    const bodyBuffer = await c.req.raw.arrayBuffer();

    const parseResult = safeJsonParse(new TextDecoder().decode(bodyBuffer));
    if (!parseResult.ok) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = parseResult.value as { action?: string; installation?: { id: number } };

    // TODO: verify the installation exists in our database before processing.
    // This prevents unauthorized installations from consuming bot resources.
    // We should look up githubInstallations by githubInstallationId and reject
    // (or silently accept 200) if the row is missing.

    const handler =
      options.githubWebhookHandler ??
      (await defaultGithubWebhookHandler(options.githubFixQueue ?? createGitHubFixQueue()));

    if (!handler) {
      return c.json({ error: "github_adapter_not_configured" }, 503);
    }

    // Reconstruct the request so the adapter can verify the webhook signature.
    const request = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
      body: bodyBuffer,
    });

    const response = await handler(request);

    if (payload.action === "deleted" && payload.installation?.id && response.ok) {
      await db
        .delete(schema.githubInstallations)
        .where(eq(schema.githubInstallations.githubInstallationId, payload.installation.id));
    }

    return response;
  });
}
