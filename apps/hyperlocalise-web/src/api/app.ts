/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
import { createApiTranslationJobQueue } from "./queues/api-translation-job-queue";
import { handleUnexpectedError, notFoundHandler } from "./errors";
import { createCanvaIntegrationRoutes } from "./routes/canva-integration/canva-integration.route";
import { createFigmaIntegrationRoutes } from "./routes/figma-integration/figma-integration.route";
import { createCrowdinAppRoutes } from "./routes/crowdin-app/crowdin-app.route";
import { createContentfulWebhookRoutes } from "./routes/contentful-webhook/contentful-webhook.route";
import { createGithubWebhookRoutes } from "./routes/github-webhook/github-webhook.route";
import { healthRoutes } from "./routes/health";
import { createPublicMediaRoutes } from "./routes/public-media/public-media.route";
import { createResendWebhookRoutes } from "./routes/resend-webhook/resend-webhook.route";
import { createSlackWebhookRoutes } from "./routes/slack-webhook/slack-webhook.route";
import { createWebChatRoutes } from "./routes/web-chat/web-chat.route";
import { workosWebhookRoutes } from "./routes/workos-webhook/workos-webhook.route";
import { createAutumnRoutes } from "./routes/autumn/autumn.route";
import { createBlogOgImageRoutes } from "./routes/blog-og-image/blog-og-image.route";
import { createGithubRepositoryAutomationDispatchRoutes } from "./routes/cron/github-repository-automation-dispatch.route";
import { createSandboxCleanupRoutes } from "./routes/cron/sandbox-cleanup.route";
import { createSnapshotCleanupRoutes } from "./routes/cron/snapshot-cleanup.route";
import { createIssueNotificationDigestRoutes } from "./routes/cron/issue-notification-digest.route";
import { createLocalisationAuditRoutes } from "./routes/localisation-audit/localisation-audit.route";
import {
  createLocalisationAuditQueue,
  createProviderAgentCommentQueue,
  createProviderAgentQaQueue,
  createProviderAgentTranslationQueue,
  createProviderAgentWritebackQueue,
} from "@/workflows/adapters";
import type { LocalisationAuditQueue } from "@/lib/workflow/types";
import { createAuthRoutes, createOrgScopedAppRoutes, createPublicApiRoutes } from "./route-groups";

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
  localisationAuditQueue?: LocalisationAuditQueue;
};

export function createApp(options: CreateAppOptions = {}) {
  const jobQueue = options.jobQueue ?? createApiTranslationJobQueue();
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
      "/localisation-audit",
      createLocalisationAuditRoutes({
        localisationAuditQueue: options.localisationAuditQueue ?? createLocalisationAuditQueue(),
      }),
    )
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
    .route(
      "/public/web-chat",
      createWebChatRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
    )
    .route("/integrations/canva", createCanvaIntegrationRoutes({ ...options, jobQueue }))
    .route("/integrations/figma", createFigmaIntegrationRoutes({ ...options, jobQueue }))
    .route("/crowdin-app", createCrowdinAppRoutes())
    .route("/webhooks", createWebhookRoutes(options));
}

export const app = createApp();

/** Inferred schema of the single runtime Hono app. Use with `testClient`, not `hc`. */
export type AppType = typeof app;

function createInternalRoutes() {
  return new Hono()
    .route("/health", healthRoutes)
    .route(
      "/cron/github-repository-automation-dispatch",
      createGithubRepositoryAutomationDispatchRoutes(),
    )
    .route("/cron/sandbox-cleanup", createSandboxCleanupRoutes())
    .route("/cron/snapshot-cleanup", createSnapshotCleanupRoutes())
    .route("/cron/issue-notification-digest", createIssueNotificationDigestRoutes());
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
