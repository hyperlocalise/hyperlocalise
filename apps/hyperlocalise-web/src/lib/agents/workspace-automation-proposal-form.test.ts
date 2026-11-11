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
  normalizeWorkspaceAutomationProposal,
  WORKSPACE_AUTOMATION_PROPOSAL_TRIGGER_MODES,
  type WorkspaceAutomationProposal,
  type WorkspaceAutomationProposalInput,
} from "./workspace-automation-proposal";
import {
  applyWorkspaceAutomationProposal,
  isWorkspaceAutomationAssistantForm,
  summarizeWorkspaceAutomationFormTrigger,
  toWorkspaceAutomationProposalBase,
} from "./workspace-automation-proposal-form";
import { listWorkspaceAutomationSetupSteps } from "./workspace-automation-setup-steps";
import { addSkillToWorkspaceAutomationForm } from "./workspace-automation-skill-form";
import { WORKSPACE_AUTOMATION_SKILLS } from "./workspace-automation-skills";
import {
  createDefaultWorkspaceAutomationFormState,
  validateWorkspaceAutomationFormState,
  WORKSPACE_AUTOMATION_API_ERROR_MESSAGES,
  type WorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

const TIME_ZONE = "Australia/Sydney";

function proposal(
  overrides: Partial<WorkspaceAutomationProposal> = {},
): WorkspaceAutomationProposal {
  return {
    name: null,
    instructions: null,
    trigger: null,
    addSkillIds: [],
    removeSkillIds: [],
    notes: [],
    ...overrides,
  };
}

function normalized(
  form: WorkspaceAutomationFormState,
  input: Partial<WorkspaceAutomationProposalInput>,
) {
  return normalizeWorkspaceAutomationProposal(
    {
      name: null,
      instructions: null,
      trigger: null,
      addSkillIds: [],
      removeSkillIds: [],
      ...input,
    },
    toWorkspaceAutomationProposalBase(form, TIME_ZONE),
  );
}

describe("applyWorkspaceAutomationProposal", () => {
  it("sets the name and instructions it is given and leaves the rest", () => {
    const form = { ...createDefaultWorkspaceAutomationFormState(), instructions: "Keep it short." };

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({ name: "Weekly digest" }),
    });

    expect(result.form).toEqual({ ...form, name: "Weekly digest" });
    expect(result.outcome).toMatchObject({ changed: true, name: "Weekly digest" });
  });

  it("clears instructions when given an empty string", () => {
    const form = { ...createDefaultWorkspaceAutomationFormState(), instructions: "Keep it short." };

    expect(
      applyWorkspaceAutomationProposal({ form, proposal: proposal({ instructions: "" }) }).form
        .instructions,
    ).toBe("");
  });

  it("reports no change for an empty proposal", () => {
    const form = createDefaultWorkspaceAutomationFormState();

    const result = applyWorkspaceAutomationProposal({ form, proposal: proposal() });

    expect(result.form).toBe(form);
    expect(result.outcome.changed).toBe(false);
  });

  it("sets a schedule and keeps the fields the proposal leaves empty", () => {
    const form = createDefaultWorkspaceAutomationFormState();

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({
        trigger: {
          mode: "scheduled",
          cadence: "weekly",
          hour: 9,
          dayOfWeek: null,
          timeZone: TIME_ZONE,
        },
      }),
    });

    expect(result.form).toMatchObject({
      triggerMode: "scheduled",
      scheduledCadence: "weekly",
      scheduledHourUtc: 9,
      scheduledDayOfWeek: form.scheduledDayOfWeek,
      scheduledTimezone: TIME_ZONE,
    });
    expect(result.outcome.trigger).toEqual({
      mode: "scheduled",
      cadence: "weekly",
      hour: 9,
      dayOfWeek: form.scheduledDayOfWeek,
      timeZone: TIME_ZONE,
    });
  });

  it("sets a GitHub trigger without switching a tool on", () => {
    const form = createDefaultWorkspaceAutomationFormState();

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({
        trigger: { mode: "github", events: ["pull_request"], branches: ["release/*"] },
      }),
    });

    expect(result.form).toEqual({
      ...form,
      triggerMode: "github",
      githubEvents: ["pull_request"],
      pushBranches: ["release/*"],
    });
  });

  it("falls back to push on main when a GitHub trigger has no events or branches", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      githubEvents: [],
      pushBranches: [],
    };

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({ trigger: { mode: "github", events: null, branches: null } }),
    });

    expect(result.outcome.trigger).toEqual({
      mode: "github",
      events: ["push"],
      branches: ["main"],
    });
  });

  it("attaches a skill, switches its tools on and prefills a setting with one choice", () => {
    const form = createDefaultWorkspaceAutomationFormState();

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({ addSkillIds: ["review-translation-changes"] }),
      defaults: { githubInstallationRepositoryId: "repo-1" },
      connections: { github: true },
    });

    expect(result.form).toMatchObject({
      skillIds: ["review-translation-changes"],
      githubEnabled: true,
      githubMode: "agent",
      githubInstallationRepositoryId: "repo-1",
    });
    expect(result.outcome.skills).toEqual([
      { id: "review-translation-changes", name: "Review translation changes", state: "added" },
    ]);
  });

  it("leaves out a skill whose integration is known to be disconnected", () => {
    const form = createDefaultWorkspaceAutomationFormState();

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({ addSkillIds: ["post-to-slack", "research-web"] }),
      connections: { slack: false },
    });

    expect(result.form.skillIds).toEqual(["research-web"]);
    expect(result.form.slackEnabled).toBe(false);
    expect(result.outcome.skills).toEqual([
      { id: "research-web", name: "Research the web", state: "added" },
      {
        id: "post-to-slack",
        name: "Post results to Slack",
        state: "needs_connection",
        missingIntegrations: ["slack"],
      },
    ]);
  });

  it("attaches a skill while its integration's status is not known", () => {
    const result = applyWorkspaceAutomationProposal({
      form: createDefaultWorkspaceAutomationFormState(),
      proposal: proposal({ addSkillIds: ["post-to-slack"] }),
    });

    expect(result.form.skillIds).toEqual(["post-to-slack"]);
  });

  it("leaves out a skill that does not run on the trigger", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      triggerMode: "scheduled" as const,
    };

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({ addSkillIds: ["comment-on-pull-request"] }),
    });

    expect(result.form).toBe(form);
    expect(result.outcome.skills).toEqual([
      {
        id: "comment-on-pull-request",
        name: "Comment on the pull request",
        state: "not_applicable",
      },
    ]);
  });

  it("does not switch the trigger for a skill the normaliser set no trigger for", () => {
    const result = applyWorkspaceAutomationProposal({
      form: createDefaultWorkspaceAutomationFormState(),
      proposal: proposal({ addSkillIds: ["comment-on-pull-request"] }),
    });

    expect(result.form.triggerMode).toBe("manual");
    expect(result.outcome.skills.map((skill) => skill.state)).toEqual(["not_applicable"]);
  });

  it("leaves out a skill whose trigger an attached skill cannot run on", () => {
    const form = addSkillToWorkspaceAutomationForm(
      createDefaultWorkspaceAutomationFormState(),
      "translate-contentful-entries",
    );

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: normalized(form, { addSkillIds: ["comment-on-pull-request"] }),
    });

    expect(result.form).toBe(form);
    expect(result.outcome.skills.map((skill) => [skill.id, skill.state])).toEqual([
      ["translate-contentful-entries", "kept"],
      ["comment-on-pull-request", "not_applicable"],
    ]);
  });

  it("detaches a skill, switches off its tools and lists the ones that stay", () => {
    const form = addSkillToWorkspaceAutomationForm(
      addSkillToWorkspaceAutomationForm(
        createDefaultWorkspaceAutomationFormState(),
        "research-web",
      ),
      "post-to-slack",
    );

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({ removeSkillIds: ["post-to-slack"] }),
    });

    expect(result.form).toMatchObject({ skillIds: ["research-web"], slackEnabled: false });
    expect(result.outcome.removedSkills).toEqual([
      { id: "post-to-slack", name: "Post results to Slack" },
    ]);
    expect(result.outcome.skills).toEqual([
      { id: "research-web", name: "Research the web", state: "kept" },
    ]);
  });

  it("lists each change it made", () => {
    const form = createDefaultWorkspaceAutomationFormState();

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: normalized(form, {
        name: "PR check",
        addSkillIds: ["comment-on-pull-request"],
      }),
    });

    expect(result.outcome.items).toEqual([
      { key: "name", kind: "name", status: "applied", before: "", after: "PR check" },
      {
        key: "trigger",
        kind: "trigger",
        status: "applied",
        before: { mode: "manual" },
        after: { mode: "github", events: ["pull_request"], branches: ["main"] },
        forSkillId: "comment-on-pull-request",
      },
      {
        key: "skill_added:comment-on-pull-request",
        kind: "skill_added",
        status: "applied",
        skillId: "comment-on-pull-request",
        skillName: "Comment on the pull request",
      },
    ]);
  });

  it("changes the trigger and drops the attached skill that cannot run on it", () => {
    const base = addSkillToWorkspaceAutomationForm(
      { ...createDefaultWorkspaceAutomationFormState(), triggerMode: "github" as const },
      "comment-on-pull-request",
    );
    const input = {
      form: base,
      proposal: normalized(base, {
        trigger: {
          mode: "scheduled",
          cadence: "weekly",
          hour: 9,
          dayOfWeek: 1,
          timeZone: null,
          githubEvents: null,
          branches: null,
        },
      }),
    };
    const dropped = [{ id: "comment-on-pull-request", name: "Comment on the pull request" }];

    const result = applyWorkspaceAutomationProposal(input);

    expect(result.form).toMatchObject({
      triggerMode: "scheduled",
      skillIds: [],
      githubCommentEnabled: false,
    });
    expect(result.outcome.items).toMatchObject([
      { key: "trigger", status: "applied", replaces: { skills: dropped, settings: [] } },
    ]);
    expect(result.outcome.removedSkills).toEqual(dropped);
  });

  it.each([
    ["GitLab", { gitlabEnabled: true, gitlabPathWithNamespace: "acme/web" }, "gitlab"],
    ["GitHub sync workflows", { githubEnabled: true, pushSourceEnabled: true }, "github_sync"],
  ] as const)(
    "attaches a skill and says it switched off %s the person turned on",
    (_name, manual, setting) => {
      const form = { ...createDefaultWorkspaceAutomationFormState(), ...manual };

      const result = applyWorkspaceAutomationProposal({
        form,
        proposal: proposal({ addSkillIds: ["review-translation-changes"] }),
        connections: { github: true },
      });

      expect(result.form).toMatchObject({
        skillIds: ["review-translation-changes"],
        githubMode: "agent",
        gitlabEnabled: false,
      });
      expect(result.outcome.items).toMatchObject([
        {
          key: "skill_added:review-translation-changes",
          status: "applied",
          replaces: { skills: [], settings: [setting] },
        },
      ]);
    },
  );

  it("never touches the project, status or model", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      projectId: "project-1",
      status: "paused" as const,
    };

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: normalized(form, {
        name: "Uploads",
        trigger: {
          mode: "source_upload",
          cadence: null,
          hour: null,
          dayOfWeek: null,
          timeZone: null,
          githubEvents: null,
          branches: null,
        },
        addSkillIds: ["post-to-slack"],
      }),
    });

    expect(result.form).toMatchObject({
      projectId: "project-1",
      status: "paused",
      model: form.model,
      skillIds: ["post-to-slack", "translate-uploaded-source"],
    });
  });

  it("reports what the resulting setup still needs", () => {
    const form = createDefaultWorkspaceAutomationFormState();
    const connections = { slack: true };

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({ name: "Notes", addSkillIds: ["post-to-slack"] }),
      connections,
    });

    expect(result.outcome.setupSteps).toEqual(
      listWorkspaceAutomationSetupSteps({ form: result.form, connections }),
    );
    expect(result.outcome.setupSteps).toEqual([
      {
        kind: "field",
        field: "slackChannelId",
        message: "Enter a valid Slack channel ID.",
        skillIds: ["post-to-slack"],
      },
      { kind: "nothing_to_deliver" },
    ]);
  });

  it.each([
    ["content sync", { kind: "content_sync" as const }],
    ["web chat", { triggerMode: "web_chat" as const }],
  ])("changes nothing on a %s automation", (_name, overrides) => {
    const form = { ...createDefaultWorkspaceAutomationFormState(), ...overrides };

    const result = applyWorkspaceAutomationProposal({
      form,
      proposal: proposal({ name: "Renamed", addSkillIds: ["research-web"] }),
    });

    expect(isWorkspaceAutomationAssistantForm(form)).toBe(false);
    expect(result.form).toBe(form);
    expect(result.outcome.changed).toBe(false);
  });

  const skillTriggerPairs = WORKSPACE_AUTOMATION_SKILLS.flatMap((skill) =>
    WORKSPACE_AUTOMATION_PROPOSAL_TRIGGER_MODES.map((mode) => [skill.id, mode] as const),
  );

  it.each(skillTriggerPairs)(
    "leaves a setup the editor accepts for skill %s on the %s trigger",
    (skillId, mode) => {
      const form = createDefaultWorkspaceAutomationFormState();

      const result = applyWorkspaceAutomationProposal({
        form,
        proposal: normalized(form, {
          trigger: {
            mode,
            cadence: "daily",
            hour: 9,
            dayOfWeek: null,
            timeZone: null,
            githubEvents: null,
            branches: null,
          },
          addSkillIds: [skillId],
        }),
      });
      const errors = validateWorkspaceAutomationFormState(result.form);

      expect(errors.skills).toBeUndefined();
      expect(errors.form).toBeUndefined();
      // A schedule with only a delivery skill has nothing to send; nothing else may be wrong.
      expect([
        undefined,
        WORKSPACE_AUTOMATION_API_ERROR_MESSAGES.scheduled_workflow_required,
      ]).toContain(errors.trigger);
      expect(result.form.triggerMode).toBe(mode);
    },
  );
});

describe("summarizeWorkspaceAutomationFormTrigger", () => {
  it("leaves out the hour of an hourly schedule and the day of a daily one", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      triggerMode: "scheduled" as const,
      scheduledTimezone: "",
    };

    expect(
      summarizeWorkspaceAutomationFormTrigger({ ...form, scheduledCadence: "hourly" }),
    ).toEqual({ mode: "scheduled", cadence: "hourly", timeZone: "UTC" });
    expect(summarizeWorkspaceAutomationFormTrigger({ ...form, scheduledCadence: "daily" })).toEqual(
      {
        mode: "scheduled",
        cadence: "daily",
        hour: form.scheduledHourUtc,
        timeZone: "UTC",
      },
    );
  });
});
