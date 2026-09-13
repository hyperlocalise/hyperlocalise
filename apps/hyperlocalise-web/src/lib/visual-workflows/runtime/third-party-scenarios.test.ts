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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  generateTextMock,
  resolveLanguageModelMock,
  slackNotificationMock,
  emailNotificationMock,
  withPublicHttpFetchMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  resolveLanguageModelMock: vi.fn(),
  slackNotificationMock: vi.fn(),
  emailNotificationMock: vi.fn(),
  withPublicHttpFetchMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (input: unknown) => input },
}));

vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: (...args: unknown[]) =>
    resolveLanguageModelMock(...args),
}));

vi.mock("@/lib/agents/workspace-automation/notification-tools", () => ({
  runWorkspaceAutomationSlackNotificationTool: (...args: unknown[]) =>
    slackNotificationMock(...args),
  runWorkspaceAutomationEmailNotificationTool: (...args: unknown[]) =>
    emailNotificationMock(...args),
}));

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();
  return {
    ...actual,
    withPublicHttpFetch: (...args: unknown[]) => withPublicHttpFetchMock(...args),
  };
});

import { err, ok } from "@/lib/primitives/result/results";

import { visualWorkflowCampaignPagesDraft } from "../fixtures/campaign-pages-draft";
import type {
  CanonicalVisualWorkflowEdge,
  CanonicalVisualWorkflowNode,
  VisualWorkflowDefinition,
} from "../schema/types";
import { toVisualWorkflowDefinition } from "../schema/serializers";
import { createMockWorkflowExecutor } from "./mock-executor";
import { runVisualWorkflowInterpreter } from "./interpreter-server";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const GITHUB_REPOSITORY_ID = "11111111-1111-4111-8111-111111111111";
const TRIGGERED_AT = "2026-09-13T01:00:00.000Z";

const edge = (
  source: string,
  target: string,
  sourceHandle: string | null = null,
): CanonicalVisualWorkflowEdge => ({
  id: `${source}:${target}:${sourceHandle ?? "out"}`,
  source,
  target,
  sourceHandle,
  targetHandle: null,
});

const graph = (
  name: string,
  nodes: CanonicalVisualWorkflowNode[],
  edges: CanonicalVisualWorkflowEdge[],
): VisualWorkflowDefinition => ({
  schemaVersion: 2,
  name,
  nodes,
  edges,
  editor: { positions: {} },
});

function campaignDefinition(): VisualWorkflowDefinition {
  return toVisualWorkflowDefinition({
    name: visualWorkflowCampaignPagesDraft.name,
    nodes: visualWorkflowCampaignPagesDraft.nodes,
    edges: visualWorkflowCampaignPagesDraft.edges,
  });
}

function sourceUploadPayload() {
  return {
    triggeredAt: TRIGGERED_AT,
    projectId: "project-campaign",
    sourceFileId: "file-brief",
    brief: "Launch the autumn collection in FR, DE, and JA.",
  };
}

function githubPullRequestPayload() {
  return {
    triggeredAt: TRIGGERED_AT,
    githubDeliveryId: "delivery-1",
    pushBranch: "feat/copy",
    commitBefore: "aaa",
    commitAfter: "bbb",
    githubEvent: "pull_request",
    pullRequestNumber: 42,
    locales: ["fr-FR", "de-DE"],
  };
}

function httpSuccess(id: string) {
  return {
    status: 201,
    statusText: "Created",
    ok: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
    json: { id },
  };
}

async function runLive(
  definition: VisualWorkflowDefinition,
  triggerInput: Record<string, unknown> = {},
) {
  const updates: string[] = [];
  const result = await runVisualWorkflowInterpreter({
    definition,
    organizationId: ORGANIZATION_ID,
    triggerInput,
    onNodeUpdate: (update) => {
      updates.push(`${update.nodeId}:${update.status}`);
    },
  });
  return { result, updates };
}

describe("visual workflow live third-party scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLanguageModelMock.mockResolvedValue({ model: { provider: "mock-ai" } });
    generateTextMock.mockImplementation(async (input: { prompt?: string }) => {
      const prompt = String(input.prompt ?? "");
      if (prompt.includes("Localise")) {
        return { text: "Localised landing page for FR, DE, and JA." };
      }
      if (prompt.includes("quality")) {
        return {
          text: "Quality review complete.",
          output: { passed: true, summary: "Ready to publish." },
        };
      }
      return { text: "Draft landing page from the campaign brief." };
    });
    slackNotificationMock.mockResolvedValue(ok(undefined));
    emailNotificationMock.mockResolvedValue(ok(undefined));
    withPublicHttpFetchMock.mockResolvedValue(httpSuccess("entry-1"));
  });

  it("publishes the campaign seed graph through mocked AI and Contentful", async () => {
    const { result, updates } = await runLive(campaignDefinition(), sourceUploadPayload());

    expect(result.ok).toBe(true);
    expect(updates).toEqual(
      expect.arrayContaining([
        "brief:succeeded",
        "draft:succeeded",
        "localise:succeeded",
        "check:succeeded",
        "cms:succeeded",
        "slack:skipped",
      ]),
    );
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(generateTextMock.mock.calls[0]?.[0]).toMatchObject({
      prompt: "Draft a landing page from the uploaded campaign brief.",
      maxRetries: 0,
    });
    expect(resolveLanguageModelMock).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
    expect(withPublicHttpFetchMock).toHaveBeenCalledWith(
      "https://api.contentful.com/spaces/demo/entries",
      expect.objectContaining({ method: "POST" }),
      expect.any(Function),
    );
    expect(slackNotificationMock).not.toHaveBeenCalled();
    expect(emailNotificationMock).not.toHaveBeenCalled();
    expect(result.nodeResults.cms).toMatchObject({ status: 201, ok: true, json: { id: "entry-1" } });
  });

  it("does not call third-party providers when the same campaign graph runs in mock mode", async () => {
    const result = await runVisualWorkflowInterpreter({
      definition: campaignDefinition(),
      organizationId: ORGANIZATION_ID,
      triggerInput: sourceUploadPayload(),
      executeNode: createMockWorkflowExecutor(),
    });

    expect(result.ok).toBe(true);
    expect(result.nodeResults.cms).toMatchObject({ simulated: true, status: 200 });
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(withPublicHttpFetchMock).not.toHaveBeenCalled();
    expect(slackNotificationMock).not.toHaveBeenCalled();
    expect(emailNotificationMock).not.toHaveBeenCalled();
    expect(resolveLanguageModelMock).not.toHaveBeenCalled();
  });

  it("rejects a live campaign run when the source-upload payload omits contract fields", async () => {
    const { result } = await runLive(campaignDefinition(), { triggeredAt: TRIGGERED_AT });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedNodeId).toBe("brief");
      expect(result.error.code).toBe("invalid_node_output");
    }
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(withPublicHttpFetchMock).not.toHaveBeenCalled();
  });

  it("routes a failed AI quality gate to Slack instead of publishing", async () => {
    generateTextMock.mockResolvedValue({
      text: "Quality review complete.",
      output: { passed: false, summary: "Tone does not match the brief." },
    });

    const definition = graph(
      "Campaign quality gate",
      [
        {
          id: "brief",
          type: "trigger.source_upload",
          config: { kind: "trigger.source_upload" },
        },
        {
          id: "review",
          type: "ai.agent",
          config: {
            kind: "ai.agent",
            prompt: "unused",
            onError: "stop",
          },
          inputs: {
            prompt: {
              kind: "template",
              template: "Run a quality review of {{trigger.brief}}",
            },
          },
          outputFields: [
            { path: "json.passed", type: "boolean" },
            { path: "json.summary", type: "string" },
          ],
        },
        {
          id: "check",
          type: "logic.if",
          config: { kind: "logic.if", condition: "{{nodes.review.json.passed}}" },
        },
        {
          id: "cms",
          type: "action.http",
          config: {
            kind: "action.http",
            method: "POST",
            url: "https://api.contentful.com/spaces/demo/entries",
            onError: "stop",
          },
        },
        {
          id: "slack",
          type: "action.notify_slack",
          config: {
            kind: "action.notify_slack",
            channelId: "C0123456789",
            message: "unused",
            onError: "stop",
          },
          inputs: {
            message: {
              kind: "template",
              template: "Review needed: {{nodes.review.json.summary}}",
            },
          },
        },
      ],
      [
        edge("brief", "review"),
        edge("review", "check"),
        edge("check", "cms", "true"),
        edge("check", "slack", "false"),
      ],
    );

    const { result, updates } = await runLive(definition, sourceUploadPayload());

    expect(result.ok).toBe(true);
    expect(updates).toContain("slack:succeeded");
    expect(updates).toContain("cms:skipped");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Run a quality review of Launch the autumn collection in FR, DE, and JA.",
      }),
    );
    expect(slackNotificationMock).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      channelId: "C0123456789",
      message: "Review needed: Tone does not match the brief.",
    });
    expect(withPublicHttpFetchMock).not.toHaveBeenCalled();
  });

  it("publishes each GitHub locale through HTTP and emails a summary", async () => {
    withPublicHttpFetchMock.mockImplementation(async (url: string) =>
      httpSuccess(`entry-${String(url).slice(-5)}`),
    );

    const definition = graph(
      "GitHub locale publish",
      [
        {
          id: "github",
          type: "trigger.github",
          config: {
            kind: "trigger.github",
            githubInstallationRepositoryId: GITHUB_REPOSITORY_ID,
            branches: ["main"],
            events: ["pull_request"],
          },
        },
        {
          id: "loop",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "{{trigger.locales}}" },
          bodyNodeIds: ["publish"],
          collect: {
            locale: { kind: "reference", nodeId: "loop", path: ["item"] },
            entryId: { kind: "reference", nodeId: "publish", path: ["json", "id"] },
          },
        },
        {
          id: "publish",
          type: "action.http",
          config: {
            kind: "action.http",
            method: "POST",
            url: "https://api.contentful.com/spaces/demo/entries",
            bodyType: "json",
            body: "{}",
            onError: "stop",
          },
          inputs: {
            "body.locale": { kind: "reference", nodeId: "loop", path: ["item"] },
            "body.pullRequest": {
              kind: "reference",
              nodeId: "$trigger",
              path: ["pullRequestNumber"],
            },
          },
        },
        {
          id: "email",
          type: "action.notify_email",
          config: {
            kind: "action.notify_email",
            provider: "resend",
            workosUserId: "user_workos_ops",
            from: "ops@example.com",
            recipients: "gtm@example.com; qa@example.com",
            subject: "unused",
            message: "unused",
            onError: "stop",
          },
          inputs: {
            subject: {
              kind: "template",
              template: "Published {{nodes.loop.count}} locales for PR {{trigger.pullRequestNumber}}",
            },
            message: {
              kind: "template",
              template: "Locales: {{nodes.loop.iterationOutputs}}",
            },
          },
        },
      ],
      [edge("github", "loop"), edge("loop", "publish", "each"), edge("loop", "email", "done")],
    );

    const { result, updates } = await runLive(definition, githubPullRequestPayload());

    expect(result.ok).toBe(true);
    expect(updates.filter((update) => update === "publish:succeeded")).toHaveLength(2);
    expect(updates).toContain("email:succeeded");
    expect(withPublicHttpFetchMock).toHaveBeenCalledTimes(2);
    expect(withPublicHttpFetchMock.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ locale: "fr-FR", pullRequest: 42 }),
      }),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ locale: "de-DE", pullRequest: 42 }),
      }),
    ]);
    expect(emailNotificationMock).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      provider: "resend",
      workosUserId: "user_workos_ops",
      from: "ops@example.com",
      recipients: ["gtm@example.com", "qa@example.com"],
      subject: "Published 2 locales for PR 42",
      message: expect.stringContaining("fr-FR"),
    });
    expect(slackNotificationMock).not.toHaveBeenCalled();
    expect(result.nodeResults.loop).toEqual({
      count: 2,
      iterationOutputs: [
        { locale: "fr-FR", entryId: expect.any(String) },
        { locale: "de-DE", entryId: expect.any(String) },
      ],
    });
  });

  it("notifies Slack on the HTTP error branch without sending email", async () => {
    withPublicHttpFetchMock.mockRejectedValue(new Error("upstream unavailable"));

    const definition = graph(
      "HTTP error branch",
      [
        { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
        {
          id: "http",
          type: "action.http",
          config: {
            kind: "action.http",
            method: "GET",
            url: "https://crm.example.com/leads/1",
            onError: "branch",
          },
        },
        {
          id: "slack",
          type: "action.notify_slack",
          config: {
            kind: "action.notify_slack",
            channelId: "C0INCIDENT",
            message: "CRM lookup failed. Inspect the provider before retrying.",
            onError: "stop",
          },
        },
        {
          id: "email",
          type: "action.notify_email",
          config: {
            kind: "action.notify_email",
            provider: "sendgrid",
            workosUserId: "user_workos_ops",
            from: "ops@example.com",
            recipients: "gtm@example.com",
            subject: "Lead ready",
            message: "CRM lookup succeeded.",
            onError: "stop",
          },
        },
      ],
      [
        edge("trigger", "http"),
        edge("http", "email"),
        edge("http", "slack", "error"),
      ],
    );

    const { result, updates } = await runLive(definition, { triggeredAt: TRIGGERED_AT });

    expect(result.ok).toBe(true);
    expect(updates).toContain("http:handled_error");
    expect(updates).toContain("slack:succeeded");
    expect(updates).toContain("email:skipped");
    expect(slackNotificationMock).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      channelId: "C0INCIDENT",
      message: "CRM lookup failed. Inspect the provider before retrying.",
    });
    expect(emailNotificationMock).not.toHaveBeenCalled();
  });

  it("stops after a Slack provider failure and leaves later email unsent", async () => {
    slackNotificationMock.mockResolvedValue(
      err({ code: "slack_send_failed", message: "channel_not_found" }),
    );

    const definition = graph(
      "Slack failure",
      [
        { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
        {
          id: "slack",
          type: "action.notify_slack",
          config: {
            kind: "action.notify_slack",
            channelId: "C0MISSING",
            message: "Publish complete.",
            onError: "stop",
          },
        },
        {
          id: "email",
          type: "action.notify_email",
          config: {
            kind: "action.notify_email",
            provider: "resend",
            workosUserId: "user_workos_ops",
            from: "ops@example.com",
            recipients: "gtm@example.com",
            subject: "Publish complete",
            message: "Notify GTM.",
            onError: "stop",
          },
        },
      ],
      [edge("trigger", "slack"), edge("slack", "email")],
    );

    const { result, updates } = await runLive(definition, { triggeredAt: TRIGGERED_AT });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedNodeId).toBe("slack");
      expect(result.error).toEqual({
        code: "slack_send_failed",
        message: "channel_not_found",
      });
    }
    expect(updates).toContain("slack:failed");
    expect(updates).not.toContain("email:succeeded");
    expect(emailNotificationMock).not.toHaveBeenCalled();
  });

  it("maps AI provider failures without calling downstream HTTP", async () => {
    generateTextMock.mockRejectedValue(new Error("gateway unavailable"));

    const definition = graph(
      "AI failure",
      [
        { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
        {
          id: "draft",
          type: "ai.agent",
          config: { kind: "ai.agent", prompt: "Draft the page.", onError: "stop" },
        },
        {
          id: "cms",
          type: "action.http",
          config: {
            kind: "action.http",
            method: "POST",
            url: "https://api.contentful.com/spaces/demo/entries",
            onError: "stop",
          },
        },
      ],
      [edge("trigger", "draft"), edge("draft", "cms")],
    );

    const { result } = await runLive(definition, { triggeredAt: TRIGGERED_AT });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedNodeId).toBe("draft");
      expect(result.error.code).toBe("ai_agent_failed");
    }
    expect(withPublicHttpFetchMock).not.toHaveBeenCalled();
  });

  it("maps a disconnected email provider without sending", async () => {
    emailNotificationMock.mockResolvedValue(
      err({
        code: "email_provider_not_connected",
        message: "Connect this provider in Integrations before using it.",
      }),
    );

    const definition = graph(
      "Email disconnected",
      [
        { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
        {
          id: "email",
          type: "action.notify_email",
          config: {
            kind: "action.notify_email",
            provider: "sendgrid",
            workosUserId: "user_workos_ops",
            from: "ops@example.com",
            recipients: "gtm@example.com",
            subject: "Automation complete",
            message: "All good",
            onError: "stop",
          },
        },
      ],
      [edge("trigger", "email")],
    );

    const { result } = await runLive(definition, { triggeredAt: TRIGGERED_AT });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedNodeId).toBe("email");
      expect(result.error.code).toBe("email_provider_not_connected");
    }
    expect(emailNotificationMock).toHaveBeenCalledTimes(1);
  });
});
