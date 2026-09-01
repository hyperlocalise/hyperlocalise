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

import type { CreateAppOptions } from "./app";
import { createContentfulWebhookRoutes } from "./routes/contentful-webhook/contentful-webhook.route";
import { createGithubWebhookRoutes } from "./routes/github-webhook/github-webhook.route";
import { healthRoutes } from "./routes/health";
import { createResendWebhookRoutes } from "./routes/resend-webhook/resend-webhook.route";
import { createSlackWebhookRoutes } from "./routes/slack-webhook/slack-webhook.route";
import { workosWebhookRoutes } from "./routes/workos-webhook/workos-webhook.route";
import { createGithubRepositoryAutomationDispatchRoutes } from "./routes/cron/github-repository-automation-dispatch.route";
import { createSandboxCleanupRoutes } from "./routes/cron/sandbox-cleanup.route";
import { createSnapshotCleanupRoutes } from "./routes/cron/snapshot-cleanup.route";
import { createIssueNotificationDigestRoutes } from "./routes/cron/issue-notification-digest.route";

export function createInternalRoutes() {
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

export function createWebhookRoutes(options: CreateAppOptions) {
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
