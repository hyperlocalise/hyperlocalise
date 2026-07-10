import { Hono } from "hono";
import { evlog, type EvlogVariables } from "evlog/hono";
import { secureHeaders } from "hono/secure-headers";

import type { FileStorageAdapter } from "@/lib/file-storage";
import type {
  EmailAgentTaskQueue,
  JobQueue,
  ProviderAgentCommentQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
  TranslationFileImportQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";
import { handleUnexpectedError, notFoundHandler } from "./errors";
import { createAgentEmailRoutes } from "./routes/agent-email/agent-email.route";
import { createAgentSlackRoutes } from "./routes/agent-slack/agent-slack.route";
import { createApiKeyRoutes } from "./routes/api-key/api-key.route";
import { authRoutes } from "./routes/auth/auth.route";
import { createConversationRoutes } from "./routes/conversation/conversation.route";
import { createCanvaConnectionRoutes } from "./routes/canva-connection/canva-connection.route";
import { createCanvaIntegrationRoutes } from "./routes/canva-integration/canva-integration.route";
import { createContentfulConnectionRoutes } from "./routes/contentful-connection/contentful-connection.route";
import { createContentfulWebhookRoutes } from "./routes/contentful-webhook/contentful-webhook.route";
import { createGlossaryRoutes } from "./routes/glossary/glossary.route";
import { createKnowledgeMemoryRoutes } from "./routes/knowledge-memory/knowledge-memory.route";
import { createMemoryRoutes } from "./routes/memory/memory.route";
import { createOrganizationIssuesRoutes } from "./routes/issues/issues.route";
import { createGithubInstallationRoutes } from "./routes/github-installation/github-installation.route";
import { createGithubWebhookRoutes } from "./routes/github-webhook/github-webhook.route";
import { healthRoutes } from "./routes/health";
import { createMcpRoutes } from "./routes/mcp/mcp.route";
import { createWorkspaceJobRoutes } from "./routes/project/job.route";
import { createProjectRoutes } from "./routes/project/project.route";
import { createProviderCredentialRoutes } from "./routes/provider-credential/provider-credential.route";
import { createPublicFileRoutes } from "./routes/public-files/public-files.route";
import { createPublicImageRoutes } from "./routes/public-images/public-images.route";
import { createPublicJobRoutes } from "./routes/public-jobs/public-jobs.route";
import { createPublicMediaRoutes } from "./routes/public-media/public-media.route";
import { createPublicTranslationRoutes } from "./routes/public-translations/public-translations.route";
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
import { createBillingRoutes } from "./routes/billing/billing.route";
import { createBlogOgImageRoutes } from "./routes/blog-og-image/blog-og-image.route";
import { createGithubRepositoryAutomationDispatchRoutes } from "./routes/cron/github-repository-automation-dispatch.route";
import { createE2eAuthRoutes } from "./routes/e2e/e2e-auth.route";
import {
  createTranslationJobEventQueue,
  createProviderAgentCommentQueue,
  createProviderAgentQaQueue,
  createProviderAgentTranslationQueue,
  createProviderAgentWritebackQueue,
} from "@/workflows/adapters";

type CreateAppOptions = {
  emailAgentTaskQueue?: EmailAgentTaskQueue;
  githubWebhookHandler?: (request: Request) => Promise<Response>;
  jobQueue?: JobQueue<TranslationJobEventData>;
  providerAgentTranslationQueue?: ProviderAgentTranslationQueue;
  providerAgentQaQueue?: ProviderAgentQaQueue;
  providerAgentCommentQueue?: ProviderAgentCommentQueue;
  providerAgentWritebackQueue?: ProviderAgentWritebackQueue;
  fileStorageAdapter?: FileStorageAdapter;
  translationFileImportQueue?: TranslationFileImportQueue;
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

  return new Hono<EvlogVariables>()
    .use("*", secureHeaders())
    .use("*", evlog())
    .basePath("/api")
    .onError(handleUnexpectedError)
    .notFound(notFoundHandler)
    .route("/", createInternalRoutes())
    .route("/auth", createAuthRoutes())
    .route("/autumn", createAutumnRoutes())
    .route("/blog", createBlogOgImageRoutes())
    .route(
      "/orgs/:organizationSlug",
      createOrgScopedAppRoutes({
        ...options,
        jobQueue,
        providerAgentTranslationQueue,
        providerAgentQaQueue,
        providerAgentCommentQueue,
        providerAgentWritebackQueue,
      }),
    )
    .route("/v1", createPublicApiRoutes({ ...options, jobQueue }))
    .route(
      "/public/media",
      createPublicMediaRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
    )
    .route("/integrations/canva", createCanvaIntegrationRoutes({ ...options, jobQueue }))
    .route("/webhooks", createWebhookRoutes(options));
}

export const app = createApp();

export type AppType = typeof app;

function createInternalRoutes() {
  return new Hono()
    .route("/", createMcpRoutes())
    .route("/health", healthRoutes)
    .route("/e2e", createE2eAuthRoutes())
    .route(
      "/cron/github-repository-automation-dispatch",
      createGithubRepositoryAutomationDispatchRoutes(),
    );
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
  },
) {
  return new Hono()
    .route("/issues", createOrganizationIssuesRoutes())
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
    .route("/canva-connections", createCanvaConnectionRoutes())
    .route("/external-tms-provider-credential", createExternalTmsProviderCredentialRoutes())
    .route(
      "/tms-provider",
      createTmsProviderRoutes({
        providerAgentTranslationQueue: options.providerAgentTranslationQueue,
      }),
    )
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
    .route("/github-installation", createGithubInstallationRoutes())
    .route("/api-keys", createApiKeyRoutes())
    .route("/billing", createBillingRoutes())
    .route("/members", createMemberRoutes())
    .route("/workspace", createWorkspaceRoutes());
}

function createPublicApiRoutes(
  options: CreateAppOptions & { jobQueue: JobQueue<TranslationJobEventData> },
) {
  return new Hono()
    .route("/files", createPublicFileRoutes({ fileStorageAdapter: options.fileStorageAdapter }))
    .route("/jobs", createPublicJobRoutes(options))
    .route("/projects", createPublicTranslationRoutes())
    .route(
      "/projects",
      createPublicImageRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
    );
}

function createWebhookRoutes(options: CreateAppOptions) {
  return new Hono()
    .route(
      "/github",
      createGithubWebhookRoutes({
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
    .route("/contentful", createContentfulWebhookRoutes())
    .route("/slack", createSlackWebhookRoutes());
}
