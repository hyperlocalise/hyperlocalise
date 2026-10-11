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

import { createBrazeAutomationRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automation-editor.fixture";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

import type { ContentEditorBrazePushItem } from "./content-editor-braze-push-queries";

export const contentEditorBrazePushStoryItems: ContentEditorBrazePushItem[] = [
  {
    sourceId: "tmpl_welcome",
    sourcePath: "braze/email/welcome-email.html",
    resourceKind: "email_template",
    status: "active",
    eligibleLocaleCount: 2,
    targetLocaleCount: 2,
    eligibleLocales: ["de", "fr"],
    lastPushedAt: null,
    lastError: null,
  },
  {
    sourceId: "tmpl_reset",
    sourcePath: "braze/email/password-reset.html",
    resourceKind: "email_template",
    status: "active",
    eligibleLocaleCount: 0,
    targetLocaleCount: 2,
    eligibleLocales: [],
    lastPushedAt: null,
    lastError: null,
  },
  {
    sourceId: "block_hero",
    sourcePath: "braze/content-block/hero-promo.html",
    resourceKind: "content_block",
    status: "push_failed",
    eligibleLocaleCount: 1,
    targetLocaleCount: 2,
    eligibleLocales: ["de"],
    lastPushedAt: "2026-10-01T12:00:00.000Z",
    lastError: "Braze timed out",
  },
];

export function createContentEditorBrazePushMswHandlers(input?: {
  projectId?: string;
  eligibleLocaleCount?: number;
  mappedItemCount?: number;
  pushRunInProgress?: boolean;
  extraAutomations?: WorkspaceAutomationRecord[];
  items?: ContentEditorBrazePushItem[];
  onQueue?: (body: { inputSnapshot?: Record<string, unknown> }) => void;
}) {
  const projectId = input?.projectId ?? "story";
  const primary = {
    ...createBrazeAutomationRecord(),
    projectId,
  };
  const automations = [primary, ...(input?.extraAutomations ?? [])];
  const items = input?.items ?? contentEditorBrazePushStoryItems;
  const brazePush = {
    eligibleLocaleCount: input?.eligibleLocaleCount ?? 2,
    mappedItemCount: input?.mappedItemCount ?? items.length,
    pushRunInProgress: input?.pushRunInProgress ?? false,
    items,
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
      return HttpResponse.json({ automation, recentRuns: [], brazePush });
    }),
    http.post("/api/orgs/:organizationSlug/automations/:automationId/runs", async ({ request }) => {
      const body = (await request.json()) as { inputSnapshot?: Record<string, unknown> };
      input?.onQueue?.(body);
      return HttpResponse.json(
        {
          automationRun: {
            id: "run_braze_push_story",
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
