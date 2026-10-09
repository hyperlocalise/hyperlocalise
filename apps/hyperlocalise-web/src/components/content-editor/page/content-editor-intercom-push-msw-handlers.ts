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
import { http, HttpResponse } from "msw";

import { createIntercomAutomationRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automation-editor.fixture";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

import type { ContentEditorIntercomPushArticle } from "./content-editor-intercom-push-queries";

export const contentEditorIntercomPushStoryArticles: ContentEditorIntercomPushArticle[] = [
  {
    articleId: "17431620",
    sourcePath: "intercom/customer-support/reset-your-password.md",
    status: "active",
    eligibleLocaleCount: 2,
    targetLocaleCount: 2,
    eligibleLocales: ["de", "fr"],
    lastPushedAt: null,
    lastError: null,
  },
  {
    articleId: "17431621",
    sourcePath: "intercom/customer-support/getting-started.md",
    status: "active",
    eligibleLocaleCount: 0,
    targetLocaleCount: 2,
    eligibleLocales: [],
    lastPushedAt: null,
    lastError: null,
  },
  {
    articleId: "17431622",
    sourcePath: "intercom/customer-support/billing.md",
    status: "push_failed",
    eligibleLocaleCount: 1,
    targetLocaleCount: 2,
    eligibleLocales: ["de"],
    lastPushedAt: "2026-10-01T12:00:00.000Z",
    lastError: "Intercom timed out",
  },
];

export function createContentEditorIntercomPushMswHandlers(input?: {
  projectId?: string;
  eligibleLocaleCount?: number;
  mappedArticleCount?: number;
  pushRunInProgress?: boolean;
  extraAutomations?: WorkspaceAutomationRecord[];
  articles?: ContentEditorIntercomPushArticle[];
  onQueue?: (body: { inputSnapshot?: Record<string, unknown> }) => void;
}) {
  const projectId = input?.projectId ?? "story";
  const primary = {
    ...createIntercomAutomationRecord(),
    projectId,
  };
  const automations = [primary, ...(input?.extraAutomations ?? [])];
  const articles = input?.articles ?? contentEditorIntercomPushStoryArticles;
  const intercomPush = {
    eligibleLocaleCount: input?.eligibleLocaleCount ?? 2,
    mappedArticleCount: input?.mappedArticleCount ?? articles.length,
    pushRunInProgress: input?.pushRunInProgress ?? false,
    articles,
  };

  return [
    http.get("/api/orgs/:organizationSlug/automations", ({ request }) => {
      const url = new URL(request.url);
      const filterProjectId = url.searchParams.get("projectId");
      const filtered = filterProjectId
        ? automations.filter((automation) => automation.projectId === filterProjectId)
        : automations;
      return HttpResponse.json({ automations: filtered });
    }),
    http.get("/api/orgs/:organizationSlug/automations/:automationId", ({ params }) => {
      const automation = automations.find((entry) => entry.id === params.automationId);
      if (!automation) {
        return new HttpResponse(null, { status: 404 });
      }
      return HttpResponse.json({ automation, recentRuns: [], intercomPush });
    }),
    http.post("/api/orgs/:organizationSlug/automations/:automationId/runs", async ({ request }) => {
      const body = (await request.json()) as { inputSnapshot?: Record<string, unknown> };
      input?.onQueue?.(body);
      return HttpResponse.json(
        {
          automationRun: {
            id: "run_intercom_push_story",
            automationId: primary.id,
            triggerSource: "manual",
            status: "queued",
          },
          dispatch: { outcome: "enqueued", inserted: true },
        },
        { status: 202 },
      );
    }),
  ];
}
