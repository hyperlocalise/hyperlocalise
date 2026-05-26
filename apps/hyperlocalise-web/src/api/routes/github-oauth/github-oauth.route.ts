import { Hono } from "hono";

import { handleGitHubInstallCallback } from "@/lib/agents/github/install-callback";
import { createLogger } from "@/lib/log";

const logger = createLogger("github-oauth");

export function createGithubOAuthRoutes() {
  return new Hono().get("/callback", async (c) => {
    logger.info(
      {
        transport: "api",
        installationId: c.req.query("installation_id") ?? null,
        setupAction: c.req.query("setup_action") ?? null,
        hasState: Boolean(c.req.query("state")),
      },
      "github install callback route hit",
    );

    const result = await handleGitHubInstallCallback({
      installationId: c.req.query("installation_id"),
      setupAction: c.req.query("setup_action"),
      state: c.req.query("state"),
    });

    return c.redirect(result.redirectTo);
  });
}
