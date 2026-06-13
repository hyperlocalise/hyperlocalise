import { Hono } from "hono";
import { evlog, type EvlogVariables } from "evlog/hono";
import { secureHeaders } from "hono/secure-headers";

import type { FileStorageAdapter } from "@/lib/file-storage";
import type {
  EmailAgentTaskQueue,
  GitHubFixQueue,
  I18nSetupQueue,
  JobQueue,
  ProviderAgentCommentQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
  ContentfulAutomationExecutionQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";
import { handleUnexpectedError, notFoundHandler } from "./errors";
import { createAgentEmailRoutes } from "./routes/agent-email/agent-email.route";
import { createAgentSlackRoutes } from "./routes/agent-slack/agent-slack.route";
import { createApiKeyRoutes } from "./routes/api-key/api-key.route";
import { authRoutes } from "./routes/auth/auth.route";
import { createConversationRoutes } from "./routes/conversation/conversation.route";
import { createContentfulConnectionRoutes } from "./routes/contentful-connection/contentful-connection.route";
import { createContentfulWebhookRoutes } from "./routes/contentful-webhook/contentful-webhook.route";
import { createGlossaryRoutes } from "./routes/glossary/glossary.route";
import { createKnowledgeMemoryRoutes } from "./routes/knowledge-memory/knowledge-memory.route";
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
import { createWorkspaceAutomationRoutes } from "./routes/workspace-automation/workspace-automation.route";
import { createExternalTmsProviderCredentialRoutes } from "./routes/external-tms-provider-credential/external-tms-provider-credential.route";
import { createTmsProviderRoutes } from "./routes/tms-provider/tms-provider.route";
import { createTmsAgentAutomationRoutes } from "./routes/tms-agent-automation/tms-agent-automation.route";
import { createTmsDashboardSummaryRoutes } from "./routes/tms-dashboard-summary/tms-dashboard-summary.route";
import { createMemberRoutes } from "./routes/member/member.route";
import { createTeamRoutes } from "./routes/team/team.route";
import { createWorkspaceRoutes } from "./routes/workspace/workspace.route";
import { workosWebhookRoutes } from "./routes/workos-webhook/workos-webhook.route";
import { createAutumnRoutes } from "./routes/autumn/autumn.route";
import { createGithubRepositoryAutomationDispatchRoutes } from "./routes/cron/github-repository-automation-dispatch.route";
import { createTmsReconciliationDispatchRoutes } from "./routes/cron/tms-reconciliation-dispatch.route";
import {
  createTranslationJobEventQueue,
  createProviderAgentCommentQueue,
  createProviderAgentQaQueue,
  createProviderAgentTranslationQueue,
  createProviderAgentWritebackQueue,
  createI18nSetupQueue,
  createContentfulAutomationExecutionQueue,
} from "@/workflows/adapters";

type CreateAppOptions = {
  emailAgentTaskQueue?: EmailAgentTaskQueue;
  githubFixQueue?: GitHubFixQueue;
  i18nSetupQueue?: I18nSetupQueue;
  githubWebhookHandler?: (request: Request) => Promise<Response>;
  jobQueue?: JobQueue<TranslationJobEventData>;
  providerAgentTranslationQueue?: ProviderAgentTranslationQueue;
  providerAgentQaQueue?: ProviderAgentQaQueue;
  providerAgentCommentQueue?: ProviderAgentCommentQueue;
  providerAgentWritebackQueue?: ProviderAgentWritebackQueue;
  contentfulAutomationExecutionQueue?: ContentfulAutomationExecutionQueue;
  fileStorageAdapter?: FileStorageAdapter;
};

export function createApp(options: CreateAppOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();
  const providerAgentTranslationQueue =
    options.providerAgentTranslationQueue ?? createProviderAgentTranslationQueue();
  const providerAgentQaQueue = options.providerAgentQaQueue ?? createProviderAgentQaQueue();
  const providerAgentCommentQueue =
    options.providerAgentCommentQueue ?? createProviderAgentCommentQueue();
  const providerAgentWritebackQueue =
    options.providerAgentWritebackQueue ?? createProviderAgentWritebackQueue();
  const i18nSetupQueue = options.i18nSetupQueue ?? createI18nSetupQueue();
  const contentfulAutomationExecutionQueue =
    options.contentfulAutomationExecutionQueue ?? createContentfulAutomationExecutionQueue();

  return new Hono<EvlogVariables>()
    .use("*", secureHeaders())
    .use("*", evlog())
    .basePath("/api")
    .onError(handleUnexpectedError)
    .notFound(notFoundHandler)
    .route("/", createInternalRoutes())
    .route("/auth", createAuthRoutes())
    .route("/autumn", createAutumnRoutes())
    .route(
      "/orgs/:organizationSlug",
      createOrgScopedAppRoutes({
        ...options,
        jobQueue,
        providerAgentTranslationQueue,
        providerAgentQaQueue,
        providerAgentCommentQueue,
        providerAgentWritebackQueue,
        i18nSetupQueue,
        contentfulAutomationExecutionQueue,
      }),
    )
    .route("/v1", createPublicApiRoutes({ ...options, jobQueue }))
    .route("/webhooks", createWebhookRoutes(options));
}

export const app = createApp();

export type AppType = typeof app;

function createInternalRoutes() {
  return new Hono()
    .route("/", createMcpRoutes())
    .route("/health", healthRoutes)
    .route(
      "/cron/github-repository-automation-dispatch",
      createGithubRepositoryAutomationDispatchRoutes(),
    )
    .route("/cron/tms-reconciliation-dispatch", createTmsReconciliationDispatchRoutes());
}

function createAuthRoutes() {
  return new Hono().route("/", authRoutes).route("/slack", createSlackOAuthRoutes());
}

function createOrgScopedAppRoutes(
  options: CreateAppOptions & {
    jobQueue: JobQueue<TranslationJobEventData>;
    providerAgentTranslationQueue: ProviderAgentTranslationQueue;
    providerAgentQaQueue: ProviderAgentQaQueue;
    providerAgentCommentQueue: ProviderAgentCommentQueue;
    providerAgentWritebackQueue: ProviderAgentWritebackQueue;
    i18nSetupQueue: I18nSetupQueue;
    contentfulAutomationExecutionQueue: ContentfulAutomationExecutionQueue;
  },
) {
  return new Hono()
    .route("/glossaries", createGlossaryRoutes())
    .route("/knowledge-memory", createKnowledgeMemoryRoutes())
    .route("/translation-memories", createMemoryRoutes())
    .route("/projects", createProjectRoutes(options))
    .route(
      "/jobs",
      createWorkspaceJobRoutes({
        jobQueue: options.jobQueue,
        providerAgentTranslationQueue: options.providerAgentTranslationQueue,
        providerAgentQaQueue: options.providerAgentQaQueue,
        providerAgentCommentQueue: options.providerAgentCommentQueue,
        providerAgentWritebackQueue: options.providerAgentWritebackQueue,
      }),
    )
    .route("/provider-credential", createProviderCredentialRoutes())
    .route("/contentful-connections", createContentfulConnectionRoutes())
    .route("/external-tms-provider-credential", createExternalTmsProviderCredentialRoutes())
    .route("/tms-provider", createTmsProviderRoutes())
    .route("/tms-agent-automation", createTmsAgentAutomationRoutes())
    .route("/tms-dashboard-summary", createTmsDashboardSummaryRoutes())
    .route("/agent-email", createAgentEmailRoutes())
    .route("/agent-slack", createAgentSlackRoutes())
    .route("/teams", createTeamRoutes())
    .route("/files", createFileRoutes({ fileStorageAdapter: options.fileStorageAdapter }))
    .route("/workspace-files", createWorkspaceFilesRoutes())
    .route("/automations", createWorkspaceAutomationRoutes())
    .route(
      "/conversations",
      createConversationRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
    )
    .route(
      "/github-installation",
      createGithubInstallationRoutes({ i18nSetupQueue: options.i18nSetupQueue }),
    )
    .route("/api-keys", createApiKeyRoutes())
    .route("/members", createMemberRoutes())
    .route("/workspace", createWorkspaceRoutes());
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
    .route(
      "/contentful",
      createContentfulWebhookRoutes({
        contentfulAutomationExecutionQueue: options.contentfulAutomationExecutionQueue,
      }),
    )
    .route("/slack", createSlackWebhookRoutes());
}
