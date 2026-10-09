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
// @vitest-environment node

import { describe, expect, it } from "vite-plus/test";

import {
  readAutomationSetupPageEdits,
  summarizeAutomationSetupCall,
} from "@/lib/agents/workspace-automation-assistant";
import { buildWorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

import { AssistantTurnInProgressError } from "./automation-assistant-api";
import {
  AUTOMATION_ASSISTANT_SAMPLE_SCRIPTS,
  createScriptedAutomationAssistantApi,
  SCRIPTED_ASSISTANT_PACES,
  scriptAssistantConversation,
} from "./automation-assistant-scripted-api";

const [SETUP, , DAILY] = AUTOMATION_ASSISTANT_SAMPLE_SCRIPTS.map((script) => script.request);

function contextFor(form: WorkspaceAutomationFormState, slack = true) {
  return buildWorkspaceAutomationEditorContext({
    editorSessionId: "editor-1",
    mode: "create",
    form,
    connections: { github: true, slack, email: true },
    timeZone: "Australia/Sydney",
    repositories: [],
    crowdinProjectIds: [],
    contentfulConnectionIds: [],
  });
}

async function runTurn(
  api: ReturnType<typeof createScriptedAutomationAssistantApi>,
  sessionId: string,
  text: string,
  form: WorkspaceAutomationFormState,
) {
  const replies = [];
  for await (const reply of api.streamAssistantTurn({
    organizationSlug: "acme",
    sessionId,
    text,
    pageContext: contextFor(form),
    lastTurnId: null,
  })) {
    replies.push(reply);
  }
  return replies;
}

describe("createScriptedAutomationAssistantApi", () => {
  it("streams a running call, then the real tool's result, then the reply, and saves the turn", async () => {
    const api = createScriptedAutomationAssistantApi({ pace: SCRIPTED_ASSISTANT_PACES.instant });
    const session = await api.createAssistantSession("acme", null);

    const replies = await runTurn(
      api,
      session.id,
      SETUP,
      createDefaultWorkspaceAutomationFormState(),
    );

    const calls = replies.map((reply) =>
      reply.parts.map(summarizeAutomationSetupCall).find(Boolean),
    );
    expect(calls.map((call) => call?.state)).toEqual([undefined, "running", "done", "done"]);
    const last = replies.at(-1)?.parts.find((part) => part.type === "text");
    expect(last).toMatchObject({
      text: expect.stringContaining(
        'I\'ve set up "Competitor news brief". It will run every Monday at 9:00 am, Sydney time.',
      ),
    });

    const saved = await api.loadAssistantSession("acme", session.id);
    expect(saved?.messages.map((message) => message.senderType)).toEqual(["user", "agent"]);
  });

  it("says what the person changed on the page between two turns", async () => {
    const api = createScriptedAutomationAssistantApi({ pace: SCRIPTED_ASSISTANT_PACES.instant });
    const session = await api.createAssistantSession("acme", null);
    const blank = createDefaultWorkspaceAutomationFormState();
    const { form } = scriptAssistantConversation({ context: contextFor(blank), requests: [SETUP] });
    await runTurn(api, session.id, SETUP, blank);

    const replies = await runTurn(api, session.id, DAILY, { ...form, name: "Morning brief" });

    expect(readAutomationSetupPageEdits(replies[0]?.parts)).toEqual([
      { kind: "name", name: "Morning brief" },
    ]);
  });

  it("answers a request it has no script for without calling the tool", async () => {
    const api = createScriptedAutomationAssistantApi({ pace: SCRIPTED_ASSISTANT_PACES.instant });
    const session = await api.createAssistantSession("acme", null);

    const replies = await runTurn(
      api,
      session.id,
      "What's the weather?",
      createDefaultWorkspaceAutomationFormState(),
    );

    expect(replies.at(-1)?.parts.some((part) => summarizeAutomationSetupCall(part))).toBe(false);
  });

  it("refuses every turn when told to", async () => {
    const api = createScriptedAutomationAssistantApi({
      pace: SCRIPTED_ASSISTANT_PACES.instant,
      failure: "turn_in_progress",
    });
    const session = await api.createAssistantSession("acme", null);

    await expect(
      runTurn(api, session.id, SETUP, createDefaultWorkspaceAutomationFormState()),
    ).rejects.toBeInstanceOf(AssistantTurnInProgressError);
  });

  it("hands a saved automation its conversation", async () => {
    const saved = scriptAssistantConversation({
      context: contextFor(createDefaultWorkspaceAutomationFormState()),
      requests: [SETUP, DAILY],
    });
    const api = createScriptedAutomationAssistantApi({
      saved: { automationId: "automation-1", messages: saved.messages },
    });

    const found = await api.findAssistantSession("acme", "automation-1");

    expect(found.messages).toHaveLength(4);
    expect(saved.form.name).toBe("Competitor news brief");
    expect(saved.form.scheduledCadence).toBe("daily");
  });
});
