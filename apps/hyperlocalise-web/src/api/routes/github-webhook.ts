import { Hono } from "hono";

import { getGitHubBot } from "@/lib/github-bot";
import { createWorkflowGitHubReviewQueue, type GitHubReviewQueue } from "@/lib/workflow";

type GithubWebhookHandler = (request: Request) => Promise<Response>;

type CreateGithubWebhookRoutesOptions = {
  githubReviewQueue?: GitHubReviewQueue;
  githubWebhookHandler?: GithubWebhookHandler;
};

async function defaultGithubWebhookHandler(queue: GitHubReviewQueue) {
  const bot = await getGitHubBot({ githubReviewQueue: queue });
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
      (await defaultGithubWebhookHandler(
        options.githubReviewQueue ?? createWorkflowGitHubReviewQueue(),
      ));

    if (!handler) {
      return c.json({ error: "github_adapter_not_configured" }, 503);
    }

    return handler(c.req.raw);
  });
}
