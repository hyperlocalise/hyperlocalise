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
  describeWorkspaceAutomationSetupStep,
  listWorkspaceAutomationSetupSteps,
} from "./workspace-automation-setup-steps";
import { addSkillToWorkspaceAutomationForm } from "./workspace-automation-skill-form";
import { WORKSPACE_AUTOMATION_SKILLS } from "./workspace-automation-skills";
import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

function namedForm(overrides: Partial<WorkspaceAutomationFormState> = {}) {
  return { ...createDefaultWorkspaceAutomationFormState(), name: "Digest", ...overrides };
}

describe("listWorkspaceAutomationSetupSteps", () => {
  it("lists what the editor's validation reports", () => {
    expect(
      listWorkspaceAutomationSetupSteps({ form: createDefaultWorkspaceAutomationFormState() }),
    ).toEqual([
      { kind: "field", field: "name", message: "Name is required." },
      { kind: "field", field: "instructions", message: "Add a skill or write instructions." },
    ]);
  });

  it("is empty for a setup that can be saved", () => {
    const form = addSkillToWorkspaceAutomationForm(namedForm(), "research-web");

    expect(listWorkspaceAutomationSetupSteps({ form })).toEqual([]);
  });

  it("puts an integration that is known to be disconnected first", () => {
    const form = addSkillToWorkspaceAutomationForm(namedForm(), "post-to-slack");

    expect(listWorkspaceAutomationSetupSteps({ form, connections: { slack: false } })).toEqual([
      { kind: "connect", integration: "slack" },
      {
        kind: "field",
        field: "slackChannelId",
        message: "Enter a valid Slack channel ID.",
        skillIds: ["post-to-slack"],
      },
      { kind: "nothing_to_deliver" },
    ]);
  });

  it("adds no connection step while a status is unknown or connected", () => {
    const form = addSkillToWorkspaceAutomationForm(namedForm(), "post-to-slack");

    expect(listWorkspaceAutomationSetupSteps({ form }).map((step) => step.kind)).toEqual([
      "field",
      "nothing_to_deliver",
    ]);
    expect(
      listWorkspaceAutomationSetupSteps({ form, connections: { slack: true } }).map(
        (step) => step.kind,
      ),
    ).toEqual(["field", "nothing_to_deliver"]);
  });

  it("names every attached skill that owns a missing setting", () => {
    const form = addSkillToWorkspaceAutomationForm(
      addSkillToWorkspaceAutomationForm(
        namedForm({ triggerMode: "github" }),
        "review-translation-changes",
      ),
      "comment-on-pull-request",
    );

    expect(listWorkspaceAutomationSetupSteps({ form })).toEqual([
      {
        kind: "field",
        field: "githubRepository",
        message: "Choose a GitHub repository.",
        skillIds: ["review-translation-changes", "comment-on-pull-request"],
      },
    ]);
  });

  it("says a skill that only sends results has nothing to send", () => {
    const delivering = addSkillToWorkspaceAutomationForm(
      namedForm({ slackChannelId: "C0123456789" }),
      "post-to-slack",
    );

    expect(listWorkspaceAutomationSetupSteps({ form: delivering })).toEqual([
      { kind: "nothing_to_deliver" },
    ]);
    expect(
      listWorkspaceAutomationSetupSteps({
        form: addSkillToWorkspaceAutomationForm(delivering, "research-web"),
      }),
    ).toEqual([]);
    expect(
      listWorkspaceAutomationSetupSteps({
        form: { ...delivering, instructions: "Post a reminder to file timesheets." },
      }),
    ).toEqual([]);
  });

  it("gives every missing setting of a skill's tools an owner", () => {
    const setupWideFields = new Set(["name", "instructions", "trigger", "skills", "form"]);

    for (const skill of WORKSPACE_AUTOMATION_SKILLS) {
      for (const triggerMode of skill.triggers) {
        const form = addSkillToWorkspaceAutomationForm(namedForm({ triggerMode }), skill.id);
        const unowned = listWorkspaceAutomationSetupSteps({ form }).filter(
          (step) =>
            step.kind === "field" &&
            !step.skillIds?.length &&
            !setupWideFields.has(step.field) &&
            // An upload trigger needs a project whatever the skills are.
            !(triggerMode === "source_upload" && step.field === "projectId"),
        );

        expect(unowned, `${skill.id} on ${triggerMode}`).toEqual([]);
      }
    }
  });

  it("lists one connection step for an integration several skills need", () => {
    const form = addSkillToWorkspaceAutomationForm(
      addSkillToWorkspaceAutomationForm(namedForm(), "review-translation-changes"),
      "comment-on-pull-request",
    );

    expect(
      listWorkspaceAutomationSetupSteps({ form, connections: { github: false } }).filter(
        (step) => step.kind === "connect",
      ),
    ).toEqual([{ kind: "connect", integration: "github" }]);
  });

  it("says a GitHub trigger needs a skill that sets the repository", () => {
    const withoutSkill = namedForm({ triggerMode: "github", instructions: "Summarise the push." });
    const withSkill = addSkillToWorkspaceAutomationForm(
      namedForm({ triggerMode: "github" }),
      "review-translation-changes",
      { githubInstallationRepositoryId: "repo-1" },
    );

    expect(listWorkspaceAutomationSetupSteps({ form: withoutSkill })).toEqual([
      { kind: "repository_for_github_trigger" },
    ]);
    expect(listWorkspaceAutomationSetupSteps({ form: withSkill })).toEqual([]);
  });

  it("says a Contentful trigger needs a skill that enables the Contentful tool", () => {
    const withoutSkill = namedForm({
      triggerMode: "contentful",
      instructions: "Translate new entries.",
    });
    const withSkill = {
      ...addSkillToWorkspaceAutomationForm(
        namedForm({ triggerMode: "contentful", projectId: "project-1" }),
        "translate-contentful-entries",
        { contentfulConnectionId: "conn-1" },
      ),
      contentfulTargetLocales: ["fr"],
    };

    expect(listWorkspaceAutomationSetupSteps({ form: withoutSkill })).toEqual([
      { kind: "contentful_tool_for_contentful_trigger" },
    ]);
    expect(listWorkspaceAutomationSetupSteps({ form: withSkill })).toEqual([]);
  });

  it("says a schedule needs something to run", () => {
    const form = addSkillToWorkspaceAutomationForm(
      namedForm({ triggerMode: "scheduled", slackChannelId: "C0123456789" }),
      "post-to-slack",
    );

    expect(listWorkspaceAutomationSetupSteps({ form })).toEqual([
      {
        kind: "field",
        field: "trigger",
        message:
          "Scheduled automations require at least one GitHub, GitLab, Contentful, Intercom, Queries, Web Search, or Crowdin workflow tool.",
      },
    ]);
    expect(
      listWorkspaceAutomationSetupSteps({
        form: addSkillToWorkspaceAutomationForm(form, "research-web"),
      }),
    ).toEqual([]);
  });
});

describe("describeWorkspaceAutomationSetupStep", () => {
  it("names the integration to connect", () => {
    expect(describeWorkspaceAutomationSetupStep({ kind: "connect", integration: "slack" })).toBe(
      "Connect Slack in Integrations.",
    );
  });

  it("uses the editor's message for a field", () => {
    expect(
      describeWorkspaceAutomationSetupStep({
        kind: "field",
        field: "githubRepository",
        message: "Choose a GitHub repository.",
      }),
    ).toBe("Choose a GitHub repository.");
  });

  it("says what to add when nothing produces a result", () => {
    expect(describeWorkspaceAutomationSetupStep({ kind: "nothing_to_deliver" })).toContain(
      "Nothing produces a result to send yet.",
    );
  });

  it("explains what a GitHub trigger is missing", () => {
    expect(
      describeWorkspaceAutomationSetupStep({ kind: "repository_for_github_trigger" }),
    ).toContain("A GitHub trigger does not run without one.");
  });

  it("explains what a Contentful trigger is missing", () => {
    expect(
      describeWorkspaceAutomationSetupStep({ kind: "contentful_tool_for_contentful_trigger" }),
    ).toContain("A Contentful trigger does not run without one.");
  });
});
