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
import { describe, expect, it } from "vite-plus/test";

import {
  applyAutomationSetupChanges,
  automationSetupChangeSchema,
  AUTOMATION_SETUP_PAGE_EDITS_PART,
  AUTOMATION_SETUP_SNAPSHOT_PART,
  describeAutomationSetupCatalogue,
  describeAutomationSetupPage,
  describeAutomationSetupPageEdits,
  listAutomationSetupPageEdits,
  readAutomationSetupPageEdits,
  readAutomationSetupSnapshot,
  collectAutomationSetupChanges,
  describeWorkspaceAutomationTrigger,
  summarizeAutomationSetupCall,
  updateWorkspaceAutomationSetup,
} from "./workspace-automation-assistant";
import {
  buildWorkspaceAutomationEditorContext,
  workspaceAutomationEditorContextSchema,
  type WorkspaceAutomationEditorContext,
} from "./workspace-automation-editor-context";
import type { WorkspaceAutomationProposalInput } from "./workspace-automation-proposal";
import { applyWorkspaceAutomationProposal } from "./workspace-automation-proposal-form";
import {
  getWorkspaceAutomationSkill,
  WORKSPACE_AUTOMATION_SKILLS,
} from "./workspace-automation-skills";
import { createDefaultWorkspaceAutomationFormState } from "./workspace-automation-view-model";

function editorContext(
  overrides: Partial<WorkspaceAutomationEditorContext> = {},
): WorkspaceAutomationEditorContext {
  return {
    kind: "automation-editor",
    editorSessionId: "session-1",
    mode: "create",
    automationId: null,
    form: createDefaultWorkspaceAutomationFormState(),
    connections: { github: true, slack: false, email: true },
    defaults: { githubInstallationRepositoryId: "repo-1" },
    timeZone: "Australia/Sydney",
    repositories: [{ id: "repo-1", name: "acme/web" }],
    ...overrides,
  };
}

function setupInput(
  overrides: Partial<WorkspaceAutomationProposalInput> = {},
): WorkspaceAutomationProposalInput {
  return {
    name: null,
    instructions: null,
    trigger: null,
    addSkillIds: [],
    removeSkillIds: [],
    ...overrides,
  };
}

const weeklySummary = setupInput({
  name: "Weekly localisation summary",
  trigger: {
    mode: "scheduled",
    cadence: "weekly",
    hour: 9,
    dayOfWeek: 1,
    timeZone: null,
    githubEvents: null,
    branches: null,
  },
  addSkillIds: ["summarize-localisation-changes", "email-results", "post-to-slack", "jira"],
});

describe("updateWorkspaceAutomationSetup", () => {
  it("says no setup page is open when the turn carries no page", () => {
    const { context, output } = updateWorkspaceAutomationSetup(null, weeklySummary);

    expect(context).toBeNull();
    expect(output).toMatchObject({ applied: false, reason: "no_setup_page_open" });
  });

  it("reports what happened to each change it was asked for", () => {
    const { output } = updateWorkspaceAutomationSetup(editorContext(), weeklySummary);

    expect(output).toMatchObject({
      applied: true,
      editorSessionId: "session-1",
      result: {
        changed: true,
        name: "Weekly localisation summary",
        trigger: {
          mode: "scheduled",
          cadence: "weekly",
          hour: 9,
          dayOfWeek: 1,
          timeZone: "Australia/Sydney",
        },
        repository: "acme/web",
        applied: [
          'The name is now "Weekly localisation summary".',
          "It now runs every Monday at 09:00 (Australia/Sydney).",
          '"Summarise localisation changes" was added.',
          `"Email results" was added. Note what it does: ${getWorkspaceAutomationSkill("email-results")?.risk}`,
        ],
        notAdded: [
          '"Post results to Slack" was not added: Slack is not connected. The person connects it in Integrations, then asks again or adds the skill on the page.',
        ],
        skills: [
          {
            id: "summarize-localisation-changes",
            name: "Summarise localisation changes",
            status: "added",
          },
          { id: "email-results", status: "added", risk: expect.any(String) },
        ],
        stillNeeded: [],
        assumed: ["Time zone: Australia/Sydney, the person's own."],
        notes: ['There is no skill with the id "jira".'],
        saved: false,
        saveButton: "Create automation",
      },
    });
  });

  it("says nothing about needs for a skill that needs nothing, so the reply has nothing to repeat", () => {
    const { output } = updateWorkspaceAutomationSetup(
      editorContext(),
      setupInput({ addSkillIds: ["research-web"] }),
    );

    expect(output).toMatchObject({ result: { skills: [{ id: "research-web" }] } });
    expect(output.applied && output.result.skills[0]).not.toHaveProperty("needs");
  });

  it("lists what each attached skill still needs apart from what the setup needs", () => {
    const { output } = updateWorkspaceAutomationSetup(
      editorContext({ defaults: {}, connections: { github: true, slack: true } }),
      setupInput({ addSkillIds: ["summarize-localisation-changes", "post-to-slack"] }),
    );

    expect(output).toMatchObject({
      result: {
        skills: [
          {
            id: "summarize-localisation-changes",
            status: "added",
            needs: ["Choose a GitHub repository."],
          },
          { id: "post-to-slack", status: "added", needs: ["Enter a valid Slack channel ID."] },
        ],
        stillNeeded: ["Name is required."],
      },
    });
  });

  it("says nothing produces a result when only a delivery skill is attached", () => {
    const { output } = updateWorkspaceAutomationSetup(
      editorContext({ connections: { slack: true } }),
      setupInput({ name: "Notes", addSkillIds: ["post-to-slack"] }),
    );

    expect(output).toMatchObject({
      result: { stillNeeded: [expect.stringContaining("Nothing produces a result to send yet.")] },
    });
  });

  it("says which values it filled in for a trigger the request did not spell out", () => {
    const { output } = updateWorkspaceAutomationSetup(
      editorContext(),
      setupInput({ name: "PR check", addSkillIds: ["comment-on-pull-request"] }),
    );

    expect(output).toMatchObject({
      result: {
        applied: [
          'The name is now "PR check".',
          "It now runs when a pull request is made to main.",
          '"Comment on the pull request" was added.',
        ],
        assumed: [
          "It runs when a pull request is made, because no event was named.",
          "Branch: main, because none was named.",
        ],
      },
    });
  });

  it("changes the trigger and says which attached skill it removed", () => {
    const first = updateWorkspaceAutomationSetup(
      editorContext(),
      setupInput({ name: "PR check", addSkillIds: ["comment-on-pull-request"] }),
    );

    const { output } = updateWorkspaceAutomationSetup(
      first.context,
      setupInput({
        trigger: {
          mode: "scheduled",
          cadence: "daily",
          hour: 9,
          dayOfWeek: null,
          timeZone: null,
          githubEvents: null,
          branches: null,
        },
      }),
    );

    expect(output).toMatchObject({
      result: {
        changed: true,
        applied: [
          'It now runs every day at 09:00 (Australia/Sydney). "Comment on the pull request" was removed because it cannot run on it.',
        ],
        skills: [],
      },
    });
  });

  it("names the save button of a saved automation", () => {
    const { output } = updateWorkspaceAutomationSetup(
      editorContext({ mode: "detail" }),
      setupInput({ name: "Renamed" }),
    );

    expect(output).toMatchObject({ result: { saveButton: "Save" } });
  });

  it("returns a proposal that gives the page the same form", () => {
    const context = editorContext();

    const { context: next, output } = updateWorkspaceAutomationSetup(context, weeklySummary);
    const change = automationSetupChangeSchema.parse(output);
    const onPage = applyWorkspaceAutomationProposal({
      form: context.form,
      proposal: change.proposal,
      defaults: context.defaults,
      connections: context.connections,
    });

    expect(onPage.form).toEqual(next?.form);
  });

  it("builds a second call on the form the first one left", () => {
    const first = updateWorkspaceAutomationSetup(editorContext(), weeklySummary);

    const second = updateWorkspaceAutomationSetup(
      first.context,
      setupInput({
        addSkillIds: ["research-web"],
        removeSkillIds: ["summarize-localisation-changes"],
      }),
    );

    expect(second.output).toMatchObject({
      result: {
        name: "Weekly localisation summary",
        applied: ['"Summarise localisation changes" was removed.', '"Research the web" was added.'],
        stillNeeded: [],
      },
    });
    expect(second.context?.form.skillIds).toEqual(["email-results", "research-web"]);
  });

  it("reports no change when nothing it was asked for can be applied", () => {
    const { output } = updateWorkspaceAutomationSetup(
      editorContext(),
      setupInput({ addSkillIds: ["post-to-slack"] }),
    );

    expect(output).toMatchObject({ applied: true, result: { changed: false } });
  });
});

describe("describeWorkspaceAutomationTrigger", () => {
  it.each([
    [{ mode: "manual" }, "when the person starts it"],
    [{ mode: "scheduled", cadence: "hourly", timeZone: "UTC" }, "every hour"],
    [{ mode: "scheduled", cadence: "daily", hour: 7, timeZone: "UTC" }, "every day at 07:00 (UTC)"],
    [
      { mode: "github", events: ["push", "pull_request"], branches: ["main", "release/*"] },
      "on every push and when a pull request is made to main, release/*",
    ],
    [{ mode: "source_upload" }, "when a source file is uploaded"],
  ] as const)("describes %o", (trigger, expected) => {
    expect(describeWorkspaceAutomationTrigger(trigger as never)).toBe(expected);
  });
});

describe("describeAutomationSetupCatalogue", () => {
  it("says what each skill needs before and after it is attached", () => {
    const instructions = describeAutomationSetupCatalogue();

    expect(instructions).toContain(
      [
        "- id: post-to-slack",
        "  name: Post results to Slack",
        "  does: Post the outcome of each run to a Slack channel.",
        "  can touch: Posts messages to the Slack channel you choose.",
        "  runs on triggers: manual, scheduled, github, contentful, source_upload",
        "  needs connected: Slack",
        "  the person chooses on the page: the Slack channel",
        "  only sends results out: it needs a skill that produces something, or instructions",
      ].join("\n"),
    );
    expect(instructions).toContain("  the person chooses on the page: the repository");
  });

  it("lists every skill with what it does, where it runs and its risk", () => {
    const instructions = describeAutomationSetupCatalogue();

    for (const skill of WORKSPACE_AUTOMATION_SKILLS) {
      expect(instructions).toContain(`- id: ${skill.id}`);
      expect(instructions).toContain(`does: ${skill.description}`);
    }
    expect(instructions).toContain(`risk: ${getWorkspaceAutomationSkill("email-results")?.risk}`);
    expect(instructions).not.toContain("web_chat");
  });

  it("is the same whatever page is open, so the system prompt never changes with it", () => {
    expect(describeAutomationSetupCatalogue()).not.toContain("Automation setup page");
  });
});

describe("describeAutomationSetupPage", () => {
  it("is marked as the page's own words and as reference, and holds no catalogue", () => {
    const page = describeAutomationSetupPage(editorContext());

    expect(page.startsWith("<automation_setup_page>\n## Automation setup page")).toBe(true);
    expect(page.endsWith("</automation_setup_page>")).toBe(true);
    expect(page).toContain("not typed by the person");
    expect(page).not.toContain("Skills you can attach");
  });

  it("describes what the page holds", () => {
    const { context } = updateWorkspaceAutomationSetup(
      editorContext({ defaults: {} }),
      weeklySummary,
    );

    const instructions = describeAutomationSetupPage(context!);

    expect(instructions).toContain('- Name: "Weekly localisation summary"');
    expect(instructions).toContain('"cadence":"weekly"');
    expect(instructions).toContain("- Repository: (none chosen)");
    expect(instructions).toContain(
      "- Summarise localisation changes (id: summarize-localisation-changes)",
    );
    expect(instructions).toContain("- slack: not connected");
    expect(instructions).toContain("- github: connected");
    expect(instructions).toContain("- crowdin: not known yet");
    expect(instructions).toContain("- Choose a GitHub repository.");
    expect(instructions).toContain('The save button is called "Create automation".');
  });

  it("says whether it is switched on and which project it is in, and nothing about models", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      status: "paused" as const,
      projectId: "project-1",
    };

    const named = describeAutomationSetupPage(
      editorContext({ form, projectName: "Automated one" }),
    );
    expect(named).toContain("- Switched off (Paused)");
    expect(named).toContain('- Project: "Automated one"');
    // The assistant is told no model, so it has none to show or to get wrong.
    expect(named).not.toMatch(/anthropic\/|openai\/|google\/|GPT|Claude|Gemini/);

    const unnamed = describeAutomationSetupPage(editorContext({ form }));
    expect(unnamed).toContain("- Project: one is chosen");

    const fresh = describeAutomationSetupPage(editorContext());
    expect(fresh).toContain("- Switched on (Active)");
    // Not a bare "none chosen", which the assistant reads as something the person must fix.
    expect(fresh).toContain("- Project: none chosen, which is fine unless");
  });

  it("lists tools the person switched on by hand", () => {
    const instructions = describeAutomationSetupPage(
      editorContext({
        form: { ...createDefaultWorkspaceAutomationFormState(), semrushEnabled: true },
      }),
    );

    expect(instructions).toContain("- Semrush");
  });

  it("shows the person's instructions as data, whole however long they are", () => {
    // As long as instructions can be saved, so a rewrite never starts from part of the text.
    const text = `${"Keep it short. ".repeat(1300)}Sign off as the docs team.`;
    const instructions = describeAutomationSetupPage(
      editorContext({
        form: { ...createDefaultWorkspaceAutomationFormState(), instructions: text },
      }),
    );

    expect(instructions).toContain(
      `<automation_instructions>\n${text}\n</automation_instructions>`,
    );
  });

  it("says a saved automation is open when editing one", () => {
    expect(describeAutomationSetupPage(editorContext({ mode: "detail" }))).toContain(
      'The save button is called "Save".',
    );
  });
});

describe("listAutomationSetupPageEdits", () => {
  const base = createDefaultWorkspaceAutomationFormState();

  it("is empty when the page is as the last turn left it", () => {
    expect(listAutomationSetupPageEdits(base, { ...base })).toEqual([]);
  });

  it("says a rename the assistant made is gone when the person discards it", () => {
    // The assistant renamed it; the person pressed Discard changes; the page shows the old name.
    const afterTheTurn = { ...base, name: "Competitor watch" };
    const pageNow = { ...base, name: "Competitor news brief" };

    const edits = listAutomationSetupPageEdits(afterTheTurn, pageNow);

    expect(edits).toEqual([{ kind: "name", name: "Competitor news brief" }]);
    expect(describeAutomationSetupPageEdits(edits)).toContain(
      'the person changed the page themselves, by hand or with Undo or Discard changes: the name is now "Competitor news brief".',
    );
  });

  it("names each kind of thing the person changed", () => {
    const { context } = updateWorkspaceAutomationSetup(
      editorContext(),
      setupInput({ addSkillIds: ["research-web"] }),
    );
    const before = context!.form;
    const after = {
      ...before,
      instructions: "Keep it short.",
      status: "paused" as const,
      triggerMode: "scheduled" as const,
      scheduledCadence: "hourly" as const,
      skillIds: [],
    };

    expect(listAutomationSetupPageEdits(before, after)).toEqual([
      { kind: "instructions", cleared: false },
      { kind: "trigger", trigger: { mode: "scheduled", cadence: "hourly", timeZone: "UTC" } },
      { kind: "skill_removed", skillName: getWorkspaceAutomationSkill("research-web")!.name },
      { kind: "status", active: false },
    ]);
  });

  it("says other settings changed for one the assistant cannot set, such as the project", () => {
    expect(listAutomationSetupPageEdits(base, { ...base, projectId: "project-1" })).toEqual([
      { kind: "other" },
    ]);
  });

  it("does not count the tools a skill switches on as other settings", () => {
    const { context } = updateWorkspaceAutomationSetup(
      editorContext(),
      setupInput({ addSkillIds: ["research-web"] }),
    );

    expect(listAutomationSetupPageEdits(base, context!.form)).toEqual([
      { kind: "skill_added", skillName: getWorkspaceAutomationSkill("research-web")!.name },
    ]);
  });

  it("sees no change in a form that only comes back with its fields in another order", () => {
    const reordered = Object.fromEntries(Object.entries(base).toReversed()) as typeof base;

    expect(listAutomationSetupPageEdits(base, reordered)).toEqual([]);
  });

  it("is read back from saved parts, and anything malformed reads as nothing", () => {
    const edits = [{ kind: "name" as const, name: "Weekly digest" }];
    expect(
      readAutomationSetupPageEdits([{ type: AUTOMATION_SETUP_PAGE_EDITS_PART, data: { edits } }]),
    ).toEqual(edits);
    expect(readAutomationSetupPageEdits([{ type: "text", text: "hello" }])).toEqual([]);
    expect(readAutomationSetupPageEdits(null)).toEqual([]);

    expect(
      readAutomationSetupSnapshot([{ type: AUTOMATION_SETUP_SNAPSHOT_PART, data: { form: base } }]),
    ).toEqual(base);
    expect(
      readAutomationSetupSnapshot([{ type: AUTOMATION_SETUP_SNAPSHOT_PART, data: { form: {} } }]),
    ).toBeNull();
  });
});

describe("collectAutomationSetupChanges", () => {
  const { output } = updateWorkspaceAutomationSetup(editorContext(), weeklySummary);

  it("returns the changes of finished calls to the setup tool, in order", () => {
    const renamed = updateWorkspaceAutomationSetup(
      editorContext(),
      setupInput({ name: "Renamed" }),
    );

    const changes = collectAutomationSetupChanges([
      { type: "text", text: "Setting that up." },
      {
        type: "tool-update_automation_setup",
        state: "output-available",
        toolCallId: "call_1",
        output,
      },
      {
        type: "dynamic-tool",
        toolName: "update_automation_setup",
        state: "output-available",
        toolCallId: "call_2",
        output: renamed.output,
      },
    ]);

    expect(changes.map((entry) => entry.toolCallId)).toEqual(["call_1", "call_2"]);
    expect(changes[0]?.change).toMatchObject({
      editorSessionId: "session-1",
      proposal: { name: "Weekly localisation summary" },
    });
    expect(changes[1]?.change.proposal.name).toBe("Renamed");
  });

  it("skips other tools, unfinished calls, refusals and outputs that do not parse", () => {
    const refusal = updateWorkspaceAutomationSetup(null, weeklySummary).output;

    expect(
      collectAutomationSetupChanges([
        { type: "tool-list_projects", state: "output-available", toolCallId: "call_1", output },
        {
          type: "tool-update_automation_setup",
          state: "input-available",
          toolCallId: "call_2",
          input: weeklySummary,
        },
        {
          type: "tool-update_automation_setup",
          state: "output-available",
          toolCallId: "call_3",
          output: refusal,
        },
        {
          type: "tool-update_automation_setup",
          state: "output-available",
          toolCallId: "call_4",
          output: { applied: true, editorSessionId: "session-1", proposal: { name: 7 } },
        },
        null,
      ]),
    ).toEqual([]);
  });
});

describe("summarizeAutomationSetupCall", () => {
  const TYPE = "tool-update_automation_setup";

  it("lists what a finished call did, with what it left out last and no instruction text", () => {
    // Slack is not connected on this page, so its skill is asked for and left out.
    const { output } = updateWorkspaceAutomationSetup(
      editorContext(),
      setupInput({
        name: "Weekly digest",
        instructions: "Keep it short.",
        trigger: weeklySummary.trigger,
        addSkillIds: ["post-to-slack", "research-web"],
      }),
    );

    const summary = summarizeAutomationSetupCall({
      type: TYPE,
      toolCallId: "call_1",
      state: "output-available",
      output,
    });

    expect(summary).toEqual({
      state: "done",
      changes: [
        { kind: "name", name: "Weekly digest" },
        { kind: "instructions", cleared: false },
        {
          kind: "trigger",
          trigger: {
            mode: "scheduled",
            cadence: "weekly",
            hour: 9,
            dayOfWeek: 1,
            timeZone: "Australia/Sydney",
          },
        },
        { kind: "skill_added", skillName: getWorkspaceAutomationSkill("research-web")!.name },
        {
          kind: "skill_not_added",
          skillName: getWorkspaceAutomationSkill("post-to-slack")!.name,
          reason: "needs_connection",
          integrations: ["slack"],
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain("Keep it short.");
  });

  it("is done with no changes for a call that changed nothing or was refused", () => {
    const { output: unchanged } = updateWorkspaceAutomationSetup(editorContext(), setupInput());
    const { output: refused } = updateWorkspaceAutomationSetup(null, setupInput());

    for (const output of [unchanged, refused]) {
      expect(
        summarizeAutomationSetupCall({ type: TYPE, state: "output-available", output }),
      ).toEqual({ state: "done", changes: [] });
    }
  });

  it("tells a running call from a failed one, and keeps a call saved without its list", () => {
    expect(summarizeAutomationSetupCall({ type: TYPE, state: "input-available" })).toEqual({
      state: "running",
    });
    expect(summarizeAutomationSetupCall({ type: TYPE, state: "output-error" })).toEqual({
      state: "failed",
    });
    expect(
      summarizeAutomationSetupCall({ type: TYPE, state: "output-available", output: "nonsense" }),
    ).toEqual({ state: "failed" });
    expect(
      summarizeAutomationSetupCall({
        type: TYPE,
        state: "output-available",
        output: { applied: true, editorSessionId: "session-1" },
      }),
    ).toEqual({ state: "done", changes: null });
  });

  it("is nothing for a part of anything else", () => {
    expect(summarizeAutomationSetupCall({ type: "text", text: "Done." })).toBeNull();
    expect(
      summarizeAutomationSetupCall({ type: "tool-search_web", state: "output-available" }),
    ).toBeNull();
  });
});

describe("applyAutomationSetupChanges", () => {
  const context = editorContext();
  const first = updateWorkspaceAutomationSetup(context, weeklySummary);
  const second = updateWorkspaceAutomationSetup(first.context, setupInput({ name: "Renamed" }));
  const changes = [
    { toolCallId: "call_1", change: automationSetupChangeSchema.parse(first.output) },
    { toolCallId: "call_2", change: automationSetupChangeSchema.parse(second.output) },
  ];
  const settings = { defaults: context.defaults, connections: context.connections };

  it("applies each change once, in order, and ends with the form the server has", () => {
    const result = applyAutomationSetupChanges({
      form: context.form,
      changes,
      editorSessionId: "session-1",
      appliedToolCallIds: new Set(),
      ...settings,
    });

    expect(result.appliedToolCallIds).toEqual(["call_1", "call_2"]);
    expect(result.form).toEqual(second.context?.form);
  });

  it("skips a change that was already applied", () => {
    const afterFirst = applyAutomationSetupChanges({
      form: context.form,
      changes: changes.slice(0, 1),
      editorSessionId: "session-1",
      appliedToolCallIds: new Set(),
      ...settings,
    });

    const result = applyAutomationSetupChanges({
      form: afterFirst.form,
      changes,
      editorSessionId: "session-1",
      appliedToolCallIds: new Set(afterFirst.appliedToolCallIds),
      ...settings,
    });

    expect(result.appliedToolCallIds).toEqual(["call_2"]);
    expect(result.form).toEqual(second.context?.form);
  });

  it("says what each call changed, and writes over what the person edited since", () => {
    const edited = { ...context.form, name: "Typed while the assistant worked" };

    const result = applyAutomationSetupChanges({
      form: edited,
      changes: changes.slice(0, 1),
      editorSessionId: "session-1",
      appliedToolCallIds: new Set(),
      ...settings,
    });

    expect(result.form.name).toBe("Weekly localisation summary");
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toMatchObject({ toolCallId: "call_1" });
    expect(result.applied[0]?.items.map((item) => [item.key, item.status])).toEqual([
      ["name", "applied"],
      ["trigger", "applied"],
      ["skill_added:summarize-localisation-changes", "applied"],
      ["skill_added:email-results", "applied"],
      ["skill_added:post-to-slack", "left_out"],
    ]);
  });

  it("leaves the form alone for a change made for another editor", () => {
    const result = applyAutomationSetupChanges({
      form: context.form,
      changes,
      editorSessionId: "session-2",
      appliedToolCallIds: new Set(),
      ...settings,
    });

    expect(result.appliedToolCallIds).toEqual([]);
    expect(result.form).toBe(context.form);
  });
});

describe("buildWorkspaceAutomationEditorContext", () => {
  const base = {
    editorSessionId: "session-1",
    mode: "create" as const,
    form: createDefaultWorkspaceAutomationFormState(),
    connections: { github: true },
    timeZone: "Australia/Sydney",
    repositories: [{ id: "repo-1", name: "acme/web", selectable: true }],
    crowdinProjectIds: ["crowdin-1"],
    contentfulConnectionIds: ["contentful-1"],
  };

  it("offers a setting as a default when the workspace has one choice", () => {
    const context = buildWorkspaceAutomationEditorContext(base);

    expect(context.defaults).toEqual({
      githubInstallationRepositoryId: "repo-1",
      crowdinProjectId: "crowdin-1",
      contentfulConnectionId: "contentful-1",
    });
    expect(context.repositories).toEqual([{ id: "repo-1", name: "acme/web" }]);
    expect(workspaceAutomationEditorContextSchema.parse(context)).toEqual(context);
  });

  it("offers no default when there are several choices or none", () => {
    const context = buildWorkspaceAutomationEditorContext({
      ...base,
      repositories: [
        { id: "repo-1", name: "acme/web", selectable: true },
        { id: "repo-2", name: "acme/docs", selectable: true },
      ],
      crowdinProjectIds: [],
      contentfulConnectionIds: ["contentful-1", "contentful-2"],
    });

    expect(context.defaults).toEqual({});
    expect(context.repositories).toEqual([]);
    expect(workspaceAutomationEditorContextSchema.parse(context)).toEqual(context);
  });

  it("names the repository the form already uses", () => {
    const context = buildWorkspaceAutomationEditorContext({
      ...base,
      form: { ...base.form, githubInstallationRepositoryId: "repo-2" },
      repositories: [
        { id: "repo-1", name: "acme/web", selectable: true },
        { id: "repo-2", name: "acme/docs", selectable: true },
      ],
    });

    expect(context.repositories).toEqual([{ id: "repo-2", name: "acme/docs" }]);
  });

  it("does not offer a repository that automations may not use", () => {
    const context = buildWorkspaceAutomationEditorContext({
      ...base,
      form: { ...base.form, githubInstallationRepositoryId: "repo-2" },
      repositories: [
        { id: "repo-1", name: "acme/web", selectable: true },
        { id: "repo-2", name: "acme/archived", selectable: false },
      ],
    });

    expect(context.defaults.githubInstallationRepositoryId).toBe("repo-1");
    expect(context.repositories).toEqual([
      { id: "repo-1", name: "acme/web" },
      { id: "repo-2", name: "acme/archived" },
    ]);
  });
});
