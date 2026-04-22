import { Hono } from "hono";

import { getGitHubBot } from "@/lib/github-bot";
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
    const handler =
      options.githubWebhookHandler ??
      (await defaultGithubWebhookHandler(options.githubFixQueue ?? createGitHubFixQueue()));

    if (!handler) {
      return c.json({ error: "github_adapter_not_configured" }, 503);
    }

    return handler(c.req.raw);
  });
}
