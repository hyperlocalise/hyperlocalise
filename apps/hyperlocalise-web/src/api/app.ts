import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import type { FileStorageAdapter } from "@/lib/file-storage";
import type {
  EmailAgentTaskQueue,
  GitHubFixQueue,
  JobQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";
import { handleUnexpectedError, notFoundHandler } from "./errors";
import { createAgentEmailRoutes } from "./routes/agent-email/agent-email.route";
import { createAgentSlackRoutes } from "./routes/agent-slack/agent-slack.route";
import { createApiKeyRoutes } from "./routes/api-key/api-key.route";
import { authRoutes } from "./routes/auth/auth.route";
import { createChatRequestRoutes } from "./routes/chat-request/chat-request.route";
import { createConversationRoutes } from "./routes/conversation/conversation.route";
import { createGlossaryRoutes } from "./routes/glossary/glossary.route";
import { createMemoryRoutes } from "./routes/memory/memory.route";
import { createGithubInstallationRoutes } from "./routes/github-installation/github-installation.route";
import { createGithubWebhookRoutes } from "./routes/github-webhook/github-webhook.route";
import { healthRoutes } from "./routes/health";
import { createMcpRoutes } from "./routes/mcp/mcp.route";
import { createWorkspaceJobRoutes } from "./routes/project/job.route";
import { createProjectRoutes } from "./routes/project/project.route";
import { createProviderCredentialRoutes } from "./routes/provider-credential/provider-credential.route";
import { createPublicFileRoutes } from "./routes/public-files/public-files.route";
import { createPublicJobRoutes } from "./routes/public-jobs/public-jobs.route";
import { createResendWebhookRoutes } from "./routes/resend-webhook/resend-webhook.route";
import { createSlackOAuthRoutes } from "./routes/slack-oauth/slack-oauth.route";
import { createSlackWebhookRoutes } from "./routes/slack-webhook/slack-webhook.route";
import { createFileRoutes } from "./routes/file/file.route";
import { createWorkspaceFilesRoutes } from "./routes/workspace-files/workspace-files.route";
import { createExternalTmsProviderCredentialRoutes } from "./routes/external-tms-provider-credential/external-tms-provider-credential.route";
import { createTeamRoutes } from "./routes/team/team.route";
import { workosWebhookRoutes } from "./routes/workos-webhook/workos-webhook.route";
import {
  createTranslationJobEventQueue,
  createProviderAgentQaQueue,
  createProviderAgentTranslationQueue,
} from "@/workflows/adapters";

type CreateAppOptions = {
  emailAgentTaskQueue?: EmailAgentTaskQueue;
  githubFixQueue?: GitHubFixQueue;
  githubWebhookHandler?: (request: Request) => Promise<Response>;
  jobQueue?: JobQueue<TranslationJobEventData>;
  providerAgentTranslationQueue?: ProviderAgentTranslationQueue;
  providerAgentQaQueue?: ProviderAgentQaQueue;
  fileStorageAdapter?: FileStorageAdapter;
};

export function createApp(options: CreateAppOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();
  const providerAgentTranslationQueue =
    options.providerAgentTranslationQueue ?? createProviderAgentTranslationQueue();
  const providerAgentQaQueue = options.providerAgentQaQueue ?? createProviderAgentQaQueue();

  return new Hono()
    .use("*", secureHeaders())
    .basePath("/api")
    .onError(handleUnexpectedError)
    .notFound(notFoundHandler)
    .route("/", createInternalRoutes())
    .route("/auth", createAuthRoutes())
    .route(
      "/",
      createLegacyAppRoutes({
        ...options,
        jobQueue,
        providerAgentTranslationQueue,
        providerAgentQaQueue,
      }),
    )
    .route(
      "/orgs/:organizationSlug",
      createOrgScopedAppRoutes({
        ...options,
        jobQueue,
        providerAgentTranslationQueue,
        providerAgentQaQueue,
      }),
    )
    .route("/v1", createPublicApiRoutes({ ...options, jobQueue }))
    .route("/webhooks", createWebhookRoutes(options));
}

export const app = createApp();

export type AppType = typeof app;

function createInternalRoutes() {
  return new Hono().route("/", createMcpRoutes()).route("/health", healthRoutes);
}

function createAuthRoutes() {
  return new Hono().route("/", authRoutes).route("/slack", createSlackOAuthRoutes());
}

function createLegacyAppRoutes(
  options: CreateAppOptions & { jobQueue: JobQueue<TranslationJobEventData> },
) {
  return new Hono()
    .route("/glossary", createGlossaryRoutes())
    .route("/memory", createMemoryRoutes())
    .route("/project", createProjectRoutes(options));
}

function createOrgScopedAppRoutes(
  options: CreateAppOptions & {
    jobQueue: JobQueue<TranslationJobEventData>;
    providerAgentTranslationQueue: ProviderAgentTranslationQueue;
    providerAgentQaQueue: ProviderAgentQaQueue;
  },
) {
  return new Hono()
    .route("/glossaries", createGlossaryRoutes())
    .route("/translation-memories", createMemoryRoutes())
    .route("/projects", createProjectRoutes(options))
    .route(
      "/jobs",
      createWorkspaceJobRoutes({
        jobQueue: options.jobQueue,
        providerAgentTranslationQueue: options.providerAgentTranslationQueue,
        providerAgentQaQueue: options.providerAgentQaQueue,
      }),
    )
    .route("/provider-credential", createProviderCredentialRoutes())
    .route("/external-tms-provider-credential", createExternalTmsProviderCredentialRoutes())
    .route("/agent-email", createAgentEmailRoutes())
    .route("/agent-slack", createAgentSlackRoutes())
    .route("/teams", createTeamRoutes())
    .route("/files", createFileRoutes({ fileStorageAdapter: options.fileStorageAdapter }))
    .route("/workspace-files", createWorkspaceFilesRoutes())
    .route("/conversations", createConversationRoutes())
    .route(
      "/chat-requests",
      createChatRequestRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
    )
    .route("/github-installation", createGithubInstallationRoutes())
    .route("/api-keys", createApiKeyRoutes());
}

function createPublicApiRoutes(
  options: CreateAppOptions & { jobQueue: JobQueue<TranslationJobEventData> },
) {
  return new Hono()
    .route("/files", createPublicFileRoutes({ fileStorageAdapter: options.fileStorageAdapter }))
    .route("/jobs", createPublicJobRoutes(options));
}

function createWebhookRoutes(options: CreateAppOptions) {
  return new Hono()
    .route(
      "/github",
      createGithubWebhookRoutes({
        githubFixQueue: options.githubFixQueue,
        githubWebhookHandler: options.githubWebhookHandler,
      }),
    )
    .route("/workos", workosWebhookRoutes)
    .route(
      "/resend",
      createResendWebhookRoutes({
        emailAgentTaskQueue: options.emailAgentTaskQueue,
      }),
    )
    .route("/slack", createSlackWebhookRoutes());
}
