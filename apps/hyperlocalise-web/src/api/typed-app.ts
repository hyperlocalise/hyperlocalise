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
import { createAuthRoutes, createOrgScopedAppRoutes, createPublicApiRoutes } from "./route-groups";
import type { CreateAppOptions } from "./app";
import { createInternalRoutes, createWebhookRoutes } from "./app-shared-routes";

/**
 * Chained Hono schema for `testClient`. Keep this out of Next's typecheck
 * (`tsconfig.build.json`) so `next build` does not instantiate the full
 * app type (TS2589). Runtime serving still uses `createApp()` in `app.ts`.
 */
export function createTypedApp(options: CreateAppOptions = {}) {
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
    .route("/webhooks", createWebhookRoutes(options))
    .route("/oauth/canva", createCanvaOauthRoutes());
}

export type AppType = ReturnType<typeof createTypedApp>;
