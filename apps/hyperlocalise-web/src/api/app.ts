import { Hono } from "hono";

import type { FileStorageAdapter } from "@/lib/file-storage";
import type {
  EmailAgentTaskQueue,
  GitHubFixQueue,
  TranslationJobQueue,
} from "@/lib/workflow/types";
import { createAgentEmailRoutes } from "./routes/agent-email/agent-email.route";
import { authRoutes } from "./routes/auth";
import { createChatRequestRoutes } from "./routes/chat-request/chat-request.route";
import { createConversationRoutes } from "./routes/conversation/conversation.route";
import { createGlossaryRoutes } from "./routes/glossary/glossary.route";
import { createGithubInstallationRoutes } from "./routes/github-installation/github-installation.route";
import { createGithubWebhookRoutes } from "./routes/github-webhook";
import { healthRoutes } from "./routes/health";
import { createWorkspaceJobRoutes } from "./routes/project/job.route";
import { createProjectRoutes } from "./routes/project/project.route";
import { createProviderCredentialRoutes } from "./routes/provider-credential/provider-credential.route";
import { createResendWebhookRoutes } from "./routes/resend-webhook";
import { createFileRoutes } from "./routes/file/file.route";
import { createTeamRoutes } from "./routes/team/team.route";
import { workosWebhookRoutes } from "./routes/workos-webhook";

type CreateAppOptions = {
  emailAgentTaskQueue?: EmailAgentTaskQueue;
  githubFixQueue?: GitHubFixQueue;
  githubWebhookHandler?: (request: Request) => Promise<Response>;
  jobQueue?: TranslationJobQueue;
  fileStorageAdapter?: FileStorageAdapter;
  /**
   * @deprecated Use `jobQueue`.
   */
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
    .route("/orgs/:organizationSlug/jobs", createWorkspaceJobRoutes())
    .route("/orgs/:organizationSlug/provider-credential", createProviderCredentialRoutes())
    .route("/orgs/:organizationSlug/agent-email", createAgentEmailRoutes())
    .route("/orgs/:organizationSlug/teams", createTeamRoutes())
    .route(
      "/orgs/:organizationSlug/files",
      createFileRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
    )
    .route("/orgs/:organizationSlug/conversations", createConversationRoutes())
    .route(
      "/orgs/:organizationSlug/chat-requests",
      createChatRequestRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
    )
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
        emailAgentTaskQueue: options.emailAgentTaskQueue,
      }),
    );
}

export const app = createApp();

export type AppType = typeof app;
