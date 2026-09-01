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

import type { FileStorageAdapter } from "@/lib/file-storage/types";
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
import { createCanvaOauthRoutes } from "./routes/canva-oauth/canva-oauth.route";
import { createFigmaIntegrationRoutes } from "./routes/figma-integration/figma-integration.route";
import { createCrowdinAppRoutes } from "./routes/crowdin-app/crowdin-app.route";
import { createPublicMediaRoutes } from "./routes/public-media/public-media.route";
import { createWebChatRoutes } from "./routes/web-chat/web-chat.route";
import { createAutumnRoutes } from "./routes/autumn/autumn.route";
import { createBlogOgImageRoutes } from "./routes/blog-og-image/blog-og-image.route";
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
import { createInternalRoutes, createWebhookRoutes } from "./app-shared-routes";

export type CreateAppOptions = {
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

export function createApp(options: CreateAppOptions = {}): Hono<EvlogVariables> {
  const jobQueue = options.jobQueue ?? createApiTranslationJobQueue();
  const providerAgentTranslationQueue =
    options.providerAgentTranslationQueue ?? createProviderAgentTranslationQueue();
  const providerAgentQaQueue = options.providerAgentQaQueue ?? createProviderAgentQaQueue();
  const providerAgentCommentQueue =
    options.providerAgentCommentQueue ?? createProviderAgentCommentQueue();
  const providerAgentWritebackQueue =
    options.providerAgentWritebackQueue ?? createProviderAgentWritebackQueue();

  let app: Hono<EvlogVariables> = new Hono<EvlogVariables>();
  app = app.use("*", secureHeaders());
  app = app.use("*", evlog());
  app = app.basePath("/api");
  app = app.onError(handleUnexpectedError);
  app = app.notFound(notFoundHandler);
  app = app.route("/", createInternalRoutes());
  app = app.route("/auth", createAuthRoutes());
  app = app.route("/autumn", createAutumnRoutes());
  app = app.route("/blog", createBlogOgImageRoutes());
  app = app.route(
    "/localisation-audit",
    createLocalisationAuditRoutes({
      localisationAuditQueue: options.localisationAuditQueue ?? createLocalisationAuditQueue(),
    }),
  );
  app = app.route(
    "/orgs/:organizationSlug",
    createOrgScopedAppRoutes({
      ...options,
      jobQueue,
      providerAgentTranslationQueue,
      providerAgentQaQueue,
      providerAgentCommentQueue,
      providerAgentWritebackQueue,
    }),
  );
  app = app.route("/v1", createPublicApiRoutes({ ...options, jobQueue }));
  app = app.route(
    "/public/media",
    createPublicMediaRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
  );
  app = app.route(
    "/public/web-chat",
    createWebChatRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
  );
  app = app.route("/integrations/canva", createCanvaIntegrationRoutes({ ...options, jobQueue }));
  app = app.route("/integrations/figma", createFigmaIntegrationRoutes({ ...options, jobQueue }));
  app = app.route("/crowdin-app", createCrowdinAppRoutes());
  app = app.route("/webhooks", createWebhookRoutes(options));
  app = app.route("/oauth/canva", createCanvaOauthRoutes());
  return app;
}

export const app = createApp();
