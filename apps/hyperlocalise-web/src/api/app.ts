import { Hono } from "hono";

import type {
  EmailTranslationQueue,
  GitHubFixQueue,
  TranslationJobQueue,
} from "@/lib/workflow/types";
import { authRoutes } from "./routes/auth";
import { createGlossaryRoutes } from "./routes/glossary/glossary.route";
import { createGithubInstallationRoutes } from "./routes/github-installation/github-installation.route";
import { createGithubWebhookRoutes } from "./routes/github-webhook";
import { healthRoutes } from "./routes/health";
import { createProjectRoutes } from "./routes/project/project.route";
import { createProviderCredentialRoutes } from "./routes/provider-credential/provider-credential.route";
import { createResendWebhookRoutes } from "./routes/resend-webhook";
import { createTeamRoutes } from "./routes/team/team.route";
import { workosWebhookRoutes } from "./routes/workos-webhook";

type CreateAppOptions = {
  emailTranslationQueue?: EmailTranslationQueue;
  githubFixQueue?: GitHubFixQueue;
  githubWebhookHandler?: (request: Request) => Promise<Response>;
  translationJobQueue?: TranslationJobQueue;
};

export function createApp(options: CreateAppOptions = {}) {
  return new Hono()
    .basePath("/api")
    .route("/auth", authRoutes)
    .route("/glossary", createGlossaryRoutes())
    .route("/orgs/:organizationSlug/glossaries", createGlossaryRoutes())
    .route("/health", healthRoutes)
    .route("/project", createProjectRoutes(options))
    .route("/orgs/:organizationSlug/projects", createProjectRoutes(options))
    .route("/orgs/:organizationSlug/provider-credential", createProviderCredentialRoutes())
    .route("/orgs/:organizationSlug/teams", createTeamRoutes())
    .route("/orgs/:organizationSlug/github-installation", createGithubInstallationRoutes())
    .route(
      "/webhooks/github",
      createGithubWebhookRoutes({
        githubFixQueue: options.githubFixQueue,
        githubWebhookHandler: options.githubWebhookHandler,
      }),
    )
    .route("/webhooks/workos", workosWebhookRoutes)
    .route(
      "/webhooks/resend",
      createResendWebhookRoutes({
        emailTranslationQueue: options.emailTranslationQueue,
      }),
    );
}

export const app = createApp();

export type AppType = typeof app;
