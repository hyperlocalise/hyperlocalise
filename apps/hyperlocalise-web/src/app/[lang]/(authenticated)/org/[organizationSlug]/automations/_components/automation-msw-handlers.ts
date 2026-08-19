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

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";

import {
  automationEditorContentfulConnectionsFixture,
  automationEditorCrowdinProjectsFixture,
  automationEditorNativeProjectsFixture,
  automationEditorRepositoriesFixture,
  automationEditorSlackChannelsFixture,
} from "./automation-editor.fixture";

export const automationEditorMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects", () =>
    HttpResponse.json({ projects: automationEditorNativeProjectsFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/tms-provider/connection", () =>
    HttpResponse.json({
      connection: {
        providerKind: "crowdin",
        displayName: "Crowdin",
        validationStatus: "valid",
        validationMessage: null,
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/tms-provider/projects", () =>
    HttpResponse.json({ projects: automationEditorCrowdinProjectsFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/github-installation", () =>
    HttpResponse.json({
      installation: {
        githubInstallationId: "12345678",
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/github-installation/repositories", () =>
    HttpResponse.json({ repositories: automationEditorRepositoriesFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-slack", () =>
    HttpResponse.json({
      slackAgent: {
        enabled: true,
        teamId: "T01234567",
        teamName: "Acme",
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-slack/channels", () =>
    HttpResponse.json({ channels: automationEditorSlackChannelsFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-email", () =>
    HttpResponse.json({
      emailAgent: {
        enabled: true,
        inboundEmailAddress: "automation@inbound.hyperlocalise.test",
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/contentful-connections", () =>
    HttpResponse.json({ contentfulConnections: automationEditorContentfulConnectionsFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/knowledge-memory", () =>
    HttpResponse.json({
      knowledgeMemory: {
        content: "# Brand\nUse sentence case for feature names.",
        updatedAt: "2026-07-01T12:00:00.000Z",
        updatedByUserId: "user_001",
      },
    }),
  ),
  http.put("/api/orgs/:organizationSlug/knowledge-memory", async ({ request }) => {
    const body = (await request.json()) as { content?: string };
    return HttpResponse.json({
      knowledgeMemory: {
        content: body.content ?? "",
        updatedAt: "2026-07-17T12:00:00.000Z",
        updatedByUserId: "user_001",
      },
    });
  }),
];

export const automationEditorDisconnectedMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects", () =>
    HttpResponse.json({ projects: automationEditorNativeProjectsFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/tms-provider/connection", () =>
    HttpResponse.json({ error: "no_active_tms_provider" }, { status: 404 }),
  ),
  http.get("/api/orgs/:organizationSlug/tms-provider/projects", () =>
    HttpResponse.json({ projects: [] }),
  ),
  http.get("/api/orgs/:organizationSlug/github-installation", () =>
    HttpResponse.json({ installation: null }),
  ),
  http.get("/api/orgs/:organizationSlug/github-installation/repositories", () =>
    HttpResponse.json({ repositories: [] }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-slack", () =>
    HttpResponse.json({
      slackAgent: {
        enabled: false,
        teamId: null,
        teamName: null,
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-slack/channels", () =>
    HttpResponse.json({ channels: [] }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-email", () =>
    HttpResponse.json({
      emailAgent: {
        enabled: false,
        inboundEmailAddress: null,
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/contentful-connections", () =>
    HttpResponse.json({ contentfulConnections: [] }),
  ),
];

export function createAutomationDetailMswHandlers(automation: WorkspaceAutomationRecord) {
  return [
    ...automationEditorMswHandlers,
    http.get("/api/orgs/:organizationSlug/automations/:automationId", () =>
      HttpResponse.json({ automation, recentRuns: [] }),
    ),
    http.patch("/api/orgs/:organizationSlug/automations/:automationId", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        automation: {
          ...automation,
          ...body,
        },
        recentRuns: [],
      });
    }),
    http.post("/api/orgs/:organizationSlug/automations/:automationId/runs", () =>
      HttpResponse.json(
        {
          automationRun: {
            id: "run_manual_001",
            automationId: automation.id,
            triggerSource: "manual",
            status: "queued",
          },
          dispatch: { outcome: "enqueued", inserted: true },
        },
        { status: 202 },
      ),
    ),
  ];
}
