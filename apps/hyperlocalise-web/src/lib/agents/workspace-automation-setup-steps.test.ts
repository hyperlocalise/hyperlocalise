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
      { kind: "field", field: "slackChannelId", message: "Enter a valid Slack channel ID." },
    ]);
  });

  it("adds no connection step while a status is unknown or connected", () => {
    const form = addSkillToWorkspaceAutomationForm(namedForm(), "post-to-slack");

    expect(listWorkspaceAutomationSetupSteps({ form }).map((step) => step.kind)).toEqual(["field"]);
    expect(
      listWorkspaceAutomationSetupSteps({ form, connections: { slack: true } }).map(
        (step) => step.kind,
      ),
    ).toEqual(["field"]);
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
          "Scheduled automations require at least one GitHub, GitLab, Contentful, Queries, Web Search, or Crowdin workflow tool.",
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

  it("explains what a GitHub trigger is missing", () => {
    expect(
      describeWorkspaceAutomationSetupStep({ kind: "repository_for_github_trigger" }),
    ).toContain("A GitHub trigger does not run without one.");
  });
});
