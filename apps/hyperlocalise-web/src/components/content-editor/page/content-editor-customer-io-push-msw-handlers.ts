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

import { createCustomerIoAutomationRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automation-editor.fixture";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

import type { ContentEditorCustomerIoPushItem } from "./content-editor-customer-io-push-queries";

export const contentEditorCustomerIoPushStoryItems: ContentEditorCustomerIoPushItem[] = [
  {
    sourceId: "1/a1",
    sourcePath: "customer-io/broadcasts/1/actions/a1.json",
    resourceKind: "broadcast",
    name: "Welcome broadcast — Welcome email",
    status: "active",
    eligibleLocaleCount: 2,
    targetLocaleCount: 2,
    eligibleLocales: ["de", "fr"],
    locales: [
      { locale: "de", translationProgress: 100, approvalProgress: 100 },
      { locale: "fr", translationProgress: 100, approvalProgress: 100 },
    ],
    lastPushedAt: null,
    lastError: null,
  },
  {
    sourceId: "1/a2",
    sourcePath: "customer-io/broadcasts/1/actions/a2.json",
    resourceKind: "broadcast",
    name: "Welcome broadcast — Upgrade nudge",
    status: "active",
    eligibleLocaleCount: 1,
    targetLocaleCount: 2,
    eligibleLocales: ["de"],
    locales: [
      { locale: "de", translationProgress: 100, approvalProgress: 100 },
      { locale: "fr", translationProgress: 100, approvalProgress: 0 },
    ],
    lastPushedAt: null,
    lastError: null,
  },
  {
    sourceId: "7/c1",
    sourcePath: "customer-io/campaigns/7/actions/c1.json",
    resourceKind: "campaign",
    name: "Onboarding — Day one push",
    status: "push_failed",
    eligibleLocaleCount: 1,
    targetLocaleCount: 2,
    eligibleLocales: ["de"],
    locales: [
      { locale: "de", translationProgress: 100, approvalProgress: 100 },
      { locale: "fr", translationProgress: 100, approvalProgress: 0 },
    ],
    lastPushedAt: "2026-10-01T12:00:00.000Z",
    lastError: "Customer.io timed out",
  },
];

export function createContentEditorCustomerIoPushMswHandlers(input?: {
  projectId?: string;
  eligibleLocaleCount?: number;
  mappedItemCount?: number;
  pushRunInProgress?: boolean;
  extraAutomations?: WorkspaceAutomationRecord[];
  items?: ContentEditorCustomerIoPushItem[];
  onQueue?: (body: { inputSnapshot?: Record<string, unknown> }) => void;
}) {
  const projectId = input?.projectId ?? "story";
  const primary = {
    ...createCustomerIoAutomationRecord(),
    projectId,
  };
  const automations = [primary, ...(input?.extraAutomations ?? [])];
  const items = input?.items ?? contentEditorCustomerIoPushStoryItems;
  const customerIoPush = {
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
      return HttpResponse.json({ automation, recentRuns: [], customerIoPush });
    }),
    http.post("/api/orgs/:organizationSlug/automations/:automationId/runs", async ({ request }) => {
      const body = (await request.json()) as { inputSnapshot?: Record<string, unknown> };
      input?.onQueue?.(body);
      return HttpResponse.json(
        {
          automationRun: {
            id: "run_customer_io_push_story",
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
