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
import { describe, expect, it, vi } from "vite-plus/test";

import { buildWorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { createDefaultWorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import { buildAutomationAssistantInstructions, createAutomationAssistantAgent } from "./agent";
import { createUpdateAutomationSetupTool } from "./tools/update_automation_setup";

vi.mock("@/lib/agent-runtime/loops/model", () => ({
  getHyperlocaliseAgentModel: () => "openai/gpt-6-luna",
}));

function context(automationId: string | null = null) {
  return buildWorkspaceAutomationEditorContext({
    editorSessionId: "session-1",
    mode: automationId ? "detail" : "create",
    automationId,
    form: createDefaultWorkspaceAutomationFormState(),
    connections: { slack: true, email: true, github: true },
    timeZone: "Australia/Sydney",
    repositories: [{ id: "repo-1", name: "acme/web", selectable: true }],
    crowdinProjectIds: [],
    contentfulConnectionIds: [],
  });
}

describe("createAutomationAssistantAgent", () => {
  it("has the setup tool and nothing else", () => {
    const agent = createAutomationAssistantAgent({ context: context() });

    expect(Object.keys(agent.tools)).toEqual(["update_automation_setup"]);
  });

  it("is told who it is, what the page holds and which skills it can attach", () => {
    const instructions = buildAutomationAssistantInstructions(context());

    expect(instructions).toContain("You are Hyperlocalise's automation assistant.");
    expect(instructions).toContain("## Automation setup page");
    expect(instructions).toContain("Mode: creating.");
    expect(instructions).toContain("### Skills you can attach");
    expect(instructions).toContain("id: summarize-localisation-changes");
    expect(instructions).not.toContain("Which automation");
    // The page says whether the setup changed and that it is unsaved; the reply must not.
    expect(instructions).toContain(
      "Never say something was changed, added, removed, set or done unless the tool result of this turn lists it",
    );
    expect(instructions).toContain("Switch the automation on or off");
    expect(instructions).toContain(
      "Say that you cannot set it and that the person picks it themselves",
    );
    expect(instructions).not.toContain("A last line saying the changes are on the page");
  });
});

describe("update_automation_setup", () => {
  it("changes the page it was given and builds the next call on the result", async () => {
    const toolContext = { automationEditor: context() };
    const tool = createUpdateAutomationSetupTool(toolContext);
    const call = { toolCallId: "call_1", messages: [], context: undefined };

    const first = await tool.execute!(
      {
        name: "Weekly digest",
        instructions: null,
        trigger: null,
        addSkillIds: ["research-web"],
        removeSkillIds: [],
      },
      call,
    );

    expect(first).toMatchObject({
      applied: true,
      editorSessionId: "session-1",
      result: {
        name: "Weekly digest",
        applied: expect.arrayContaining([expect.stringContaining("was added")]),
      },
    });
    expect(toolContext.automationEditor.form).toMatchObject({
      name: "Weekly digest",
      skillIds: ["research-web"],
    });

    const second = await tool.execute!(
      {
        name: null,
        instructions: null,
        trigger: null,
        addSkillIds: [],
        removeSkillIds: ["research-web"],
      },
      { ...call, toolCallId: "call_2" },
    );

    expect(second).toMatchObject({ applied: true, result: { name: "Weekly digest" } });
    expect(toolContext.automationEditor.form.skillIds).toEqual([]);
  });
});
