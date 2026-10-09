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
import "dotenv/config";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { analyticsTrackMock, reserveAgentRuntimeUsageMock, trackSucceededAgentRuntimeUsageMock } =
  vi.hoisted(() => ({
    analyticsTrackMock: vi.fn(),
    reserveAgentRuntimeUsageMock: vi.fn(),
    trackSucceededAgentRuntimeUsageMock: vi.fn(),
  }));

vi.mock("@/lib/analytics/server", () => ({
  serverAnalytics: { track: analyticsTrackMock },
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  addAiTokenUsage: (first: unknown, second: unknown) => first ?? second ?? null,
  extractAiSdkTokenUsage: (usage: unknown) => usage,
  reserveAgentRuntimeUsage: reserveAgentRuntimeUsageMock,
  trackSucceededAgentRuntimeUsage: trackSucceededAgentRuntimeUsageMock,
}));

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { UPDATE_AUTOMATION_SETUP_TOOL_NAME } from "@/lib/agents/workspace-automation-assistant";
import { buildWorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { createDefaultWorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import {
  readAutomationSetupPageEdits,
  readAutomationSetupSnapshot,
} from "@/lib/agents/workspace-automation-assistant";
import {
  beginAutomationAssistantTurn,
  createAutomationAssistantSession,
  getAutomationAssistantSession,
  listAutomationAssistantMessages,
} from "@/lib/automation-assistant/sessions";
import { db, schema } from "@/lib/database/client";

import { AUTOMATION_ASSISTANT_USAGE_SOURCE, createAutomationAssistantTurnResponse } from "./web";

const fixture = createAuthTestFixture();

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/** A model that names the automation through the setup tool, then says what it did. */
function modelThatNamesTheAutomation() {
  return new MockLanguageModelV3({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: UPDATE_AUTOMATION_SETUP_TOOL_NAME,
              input: JSON.stringify({
                name: "Weekly digest",
                instructions: null,
                trigger: null,
                addSkillIds: [],
                removeSkillIds: [],
              }),
            },
            {
              type: "finish",
              finishReason: { unified: "tool-calls", raw: undefined },
              usage: USAGE,
            },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "text_1" },
            { type: "text-delta", id: "text_1", delta: "I named it Weekly digest." },
            { type: "text-end", id: "text_1" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: USAGE },
          ],
        }),
      },
    ],
  });
}

function pageContext() {
  return buildWorkspaceAutomationEditorContext({
    editorSessionId: "editor-1",
    mode: "create",
    automationId: null,
    form: createDefaultWorkspaceAutomationFormState(),
    connections: { slack: true },
    timeZone: "Australia/Sydney",
    repositories: [],
    crowdinProjectIds: [],
    contentfulConnectionIds: [],
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("createAutomationAssistantTurnResponse", () => {
  it("keeps both sides of the turn in the session, bills one run and releases the turn", async () => {
    const { user, organization } = await fixture.createLocalWorkosIdentity();
    const scope = { organizationId: organization.id, userId: user.id };
    const session = await createAutomationAssistantSession(scope);
    expect(await beginAutomationAssistantTurn(session.id)).toBe(true);

    const model = modelThatNamesTheAutomation();
    const response = createAutomationAssistantTurnResponse({
      session,
      organizationId: organization.id,
      text: "Call it Weekly digest",
      pageContext: pageContext(),
      languageModel: { model, source: "gateway", modelId: "mock" },
    });
    const streamed = await response.text();

    expect(streamed).toContain("I named it Weekly digest.");
    // The page as it stands leads the newest message and the request ends it. It is not saved
    // with the message, and the system prompt holds none of it.
    const prompt = model.doStreamCalls[0]!.prompt;
    const newest = JSON.stringify(prompt.at(-1));
    expect(newest.indexOf("## Automation setup page")).toBeGreaterThan(-1);
    expect(newest.indexOf("- Name: (none yet)")).toBeGreaterThan(-1);
    expect(newest.indexOf("Call it Weekly digest")).toBeGreaterThan(
      newest.indexOf("</automation_setup_page>"),
    );
    expect(JSON.stringify(prompt[0])).not.toContain("## Automation setup page");
    await vi.waitFor(() => expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledTimes(1));

    const messages = await listAutomationAssistantMessages(session.id);
    expect(messages).toMatchObject([
      // The page block was not saved with it.
      { senderType: "user", text: "Call it Weekly digest", parts: null },
      { senderType: "agent", text: "I named it Weekly digest." },
    ]);
    // The stream names the turn by the saved message, so the page knows the session's latest.
    expect(streamed).toContain(`"type":"data-turn","data":{"id":"${messages[0]!.id}"}`);
    expect(messages[1]!.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: `tool-${UPDATE_AUTOMATION_SETUP_TOOL_NAME}`,
          toolCallId: "call_1",
          output: expect.objectContaining({ applied: true, editorSessionId: "editor-1" }),
        }),
      ]),
    );

    expect(analyticsTrackMock.mock.calls).toEqual([
      ["automation_assistant_message_sent", { status: "sent", source: "new_automation" }],
    ]);

    // The session is not a conversation: nothing is written to the tables the Inbox reads, and
    // the usage record names the session in its dimensions instead of linking to a conversation.
    const conversations = await db
      .select({ id: schema.interactions.id })
      .from(schema.interactions)
      .where(eq(schema.interactions.organizationId, organization.id));
    expect(conversations).toEqual([]);
    const usage = {
      surface: "automation_assistant",
      mode: "create",
      automation_assistant_session_id: session.id,
    };
    expect(reserveAgentRuntimeUsageMock).toHaveBeenCalledTimes(1);
    expect(reserveAgentRuntimeUsageMock.mock.calls[0]![0]).toMatchObject({
      organizationId: organization.id,
      source: AUTOMATION_ASSISTANT_USAGE_SOURCE,
      dimensions: usage,
    });
    expect(reserveAgentRuntimeUsageMock.mock.calls[0]![0]).not.toHaveProperty("interactionId");
    expect(trackSucceededAgentRuntimeUsageMock.mock.calls[0]![0]).toMatchObject({
      dimensions: usage,
      aiCreditModelId: "mock",
      aiCreditCredentialSource: "gateway",
    });
    expect(trackSucceededAgentRuntimeUsageMock.mock.calls[0]![0]).not.toHaveProperty(
      "interactionId",
    );

    await vi.waitFor(async () => {
      const after = await getAutomationAssistantSession({ ...scope, sessionId: session.id });
      expect(after?.turnStartedAt).toBeNull();
    });
  });

  it("records what the person changed on the page since the last turn, and tells the model", async () => {
    const { user, organization } = await fixture.createLocalWorkosIdentity();
    const scope = { organizationId: organization.id, userId: user.id };
    const session = await createAutomationAssistantSession(scope);
    const turn = async (model: MockLanguageModelV3) => {
      expect(await beginAutomationAssistantTurn(session.id)).toBe(true);
      const response = createAutomationAssistantTurnResponse({
        session,
        organizationId: organization.id,
        text: "Call it Weekly digest",
        // Both turns come from a page with no name: the person discarded the first turn's rename.
        pageContext: pageContext(),
        languageModel: { model, source: "gateway", modelId: "mock" },
      });
      const streamed = await response.text();
      await vi.waitFor(async () => {
        const after = await getAutomationAssistantSession({ ...scope, sessionId: session.id });
        expect(after?.turnStartedAt).toBeNull();
      });
      return streamed;
    };

    // The page hears of the person's own edits in the stream, to show above their message.
    expect(await turn(modelThatNamesTheAutomation())).not.toContain("data-page-edits");
    const second = modelThatNamesTheAutomation();
    expect(await turn(second)).toContain("data-page-edits");

    const messages = await listAutomationAssistantMessages(session.id);
    expect(messages.map((message) => message.senderType)).toEqual([
      "user",
      "agent",
      "user",
      "agent",
    ]);
    // The first reply kept the form its turn left, with the new name.
    expect(readAutomationSetupSnapshot(messages[1]!.parts)).toMatchObject({
      name: "Weekly digest",
    });
    // Nothing had changed before the first message. Before the second, the name was gone again.
    expect(readAutomationSetupPageEdits(messages[0]!.parts)).toEqual([]);
    expect(readAutomationSetupPageEdits(messages[2]!.parts)).toEqual([{ kind: "name", name: "" }]);

    const newest = JSON.stringify(second.doStreamCalls[0]!.prompt.at(-1));
    expect(newest).toContain("[Page record, written by the page");
    expect(newest).toContain("the name was cleared");
    expect(newest).toContain("- Name: (none yet)");
    // The saved form is for the server's comparison only and never reaches the model.
    expect(JSON.stringify(second.doStreamCalls[0]!.prompt)).not.toContain("data-setup-after");
  });

  it("releases the turn and saves no reply when the model fails", async () => {
    const { user, organization } = await fixture.createLocalWorkosIdentity();
    const scope = { organizationId: organization.id, userId: user.id };
    const session = await createAutomationAssistantSession(scope);
    expect(await beginAutomationAssistantTurn(session.id)).toBe(true);

    const response = createAutomationAssistantTurnResponse({
      session,
      organizationId: organization.id,
      text: "Call it Weekly digest",
      pageContext: pageContext(),
      languageModel: {
        model: new MockLanguageModelV3({
          doStream: async () => {
            throw new Error("model down");
          },
        }),
        source: "gateway",
        modelId: "mock",
      },
    });
    await response.text();

    await vi.waitFor(async () => {
      const after = await getAutomationAssistantSession({ ...scope, sessionId: session.id });
      expect(after?.turnStartedAt).toBeNull();
    });
    const messages = await listAutomationAssistantMessages(session.id);
    // The person's message was sent, so it is saved and counted even though no reply came.
    expect(analyticsTrackMock).toHaveBeenCalledTimes(1);
    expect(messages.filter((message) => message.senderType === "user")).toHaveLength(1);
    expect(messages.some((message) => message.text.includes("I named it"))).toBe(false);
  });
});
