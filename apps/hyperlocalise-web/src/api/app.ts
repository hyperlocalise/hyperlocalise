import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import type { FileStorageAdapter } from "@/lib/file-storage";
import type {
  EmailAgentTaskQueue,
  GitHubFixQueue,
  JobQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";
import { createAgentEmailRoutes } from "./routes/agent-email/agent-email.route";
import { createAgentSlackRoutes } from "./routes/agent-slack/agent-slack.route";
import { createApiKeyRoutes } from "./routes/api-key/api-key.route";
import { authRoutes } from "./routes/auth";
import { createChatRequestRoutes } from "./routes/chat-request/chat-request.route";
import { createConversationRoutes } from "./routes/conversation/conversation.route";
import { createGlossaryRoutes } from "./routes/glossary/glossary.route";
import { createGithubInstallationRoutes } from "./routes/github-installation/github-installation.route";
import { createGithubWebhookRoutes } from "./routes/github-webhook";
import { healthRoutes } from "./routes/health";
import { createMcpRoutes } from "./routes/mcp/mcp.route";
import { createWorkspaceJobRoutes } from "./routes/project/job.route";
import { createProjectRoutes } from "./routes/project/project.route";
import { createProviderCredentialRoutes } from "./routes/provider-credential/provider-credential.route";
import { createPublicFileRoutes } from "./routes/public-files/public-files.route";
import { createPublicJobRoutes } from "./routes/public-jobs/public-jobs.route";
import { createResendWebhookRoutes } from "./routes/resend-webhook";
import { createSlackOAuthRoutes } from "./routes/slack-oauth";
import { createSlackWebhookRoutes } from "./routes/slack-webhook";
import { createFileRoutes } from "./routes/file/file.route";
import { createTeamRoutes } from "./routes/team/team.route";
import { workosWebhookRoutes } from "./routes/workos-webhook";
import { createTranslationJobEventQueue } from "@/workflows/adapters";

type CreateAppOptions = {
  emailAgentTaskQueue?: EmailAgentTaskQueue;
  githubFixQueue?: GitHubFixQueue;
  githubWebhookHandler?: (request: Request) => Promise<Response>;
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
};

export function createApp(options: CreateAppOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();

  return new Hono()
    .use("*", secureHeaders())
    .basePath("/api")
    .route("/", createMcpRoutes())
    .route("/auth", authRoutes)
    .route("/auth/slack", createSlackOAuthRoutes())
    .route("/glossary", createGlossaryRoutes())
    .route("/orgs/:organizationSlug/glossaries", createGlossaryRoutes())
    .route("/health", healthRoutes)
    .route("/project", createProjectRoutes({ ...options, jobQueue }))
    .route("/orgs/:organizationSlug/projects", createProjectRoutes({ ...options, jobQueue }))
    .route("/orgs/:organizationSlug/jobs", createWorkspaceJobRoutes({ jobQueue }))
    .route("/orgs/:organizationSlug/provider-credential", createProviderCredentialRoutes())
    .route("/orgs/:organizationSlug/agent-email", createAgentEmailRoutes())
    .route("/orgs/:organizationSlug/agent-slack", createAgentSlackRoutes())
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
    .route("/orgs/:organizationSlug/api-keys", createApiKeyRoutes())
    .route("/v1/files", createPublicFileRoutes({ fileStorageAdapter: options.fileStorageAdapter }))
    .route("/v1/jobs", createPublicJobRoutes({ ...options, jobQueue }))
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
    )
    .route("/webhooks/slack", createSlackWebhookRoutes());
}

export const app = createApp();

export type AppType = typeof app;
