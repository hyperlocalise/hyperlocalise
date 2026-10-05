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
  isWorkspaceAutomationProposalEmpty,
  normalizeWorkspaceAutomationProposal,
  WORKSPACE_AUTOMATION_TRIGGER_WORK_SKILL_IDS,
  workspaceAutomationProposalSchema,
  type WorkspaceAutomationProposalBase,
  type WorkspaceAutomationProposalInput,
} from "./workspace-automation-proposal";
import { getWorkspaceAutomationSkill } from "./workspace-automation-skills";
import {
  WORKSPACE_AUTOMATION_INSTRUCTIONS_MAX_CHARS,
  WORKSPACE_AUTOMATION_NAME_MAX_CHARS,
} from "./workspace-automation-types";

const BROWSER_TIME_ZONE = "Australia/Sydney";

function proposalInput(
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

function triggerInput(
  overrides: Partial<NonNullable<WorkspaceAutomationProposalInput["trigger"]>> & {
    mode: NonNullable<WorkspaceAutomationProposalInput["trigger"]>["mode"];
  },
): NonNullable<WorkspaceAutomationProposalInput["trigger"]> {
  return {
    cadence: null,
    hour: null,
    dayOfWeek: null,
    timeZone: null,
    githubEvents: null,
    branches: null,
    ...overrides,
  };
}

function proposalBase(
  overrides: Partial<WorkspaceAutomationProposalBase> = {},
): WorkspaceAutomationProposalBase {
  return { triggerMode: "manual", skillIds: [], timeZone: BROWSER_TIME_ZONE, ...overrides };
}

describe("normalizeWorkspaceAutomationProposal", () => {
  it("keeps known skills once and reports the ones it does not know", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({ addSkillIds: ["research-web", " research-web ", "create-jira-ticket", ""] }),
      proposalBase(),
    );

    expect(proposal.addSkillIds).toEqual(["research-web"]);
    expect(proposal.notes).toEqual([{ code: "unknown_skill", skillId: "create-jira-ticket" }]);
  });

  it("drops a skill that is listed to add and to remove", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({ addSkillIds: ["post-to-slack"], removeSkillIds: ["post-to-slack"] }),
      proposalBase({ skillIds: ["post-to-slack"] }),
    );

    expect(proposal.addSkillIds).toEqual([]);
    expect(proposal.removeSkillIds).toEqual([]);
    expect(proposal.notes).toEqual([{ code: "skill_in_both_lists", skillId: "post-to-slack" }]);
  });

  it("does not add an attached skill or remove one that is not attached", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({ addSkillIds: ["research-web"], removeSkillIds: ["post-to-slack"] }),
      proposalBase({ skillIds: ["research-web"] }),
    );

    expect(proposal.addSkillIds).toEqual([]);
    expect(proposal.removeSkillIds).toEqual([]);
    expect(proposal.notes).toEqual([
      { code: "skill_already_attached", skillId: "research-web" },
      { code: "skill_not_attached", skillId: "post-to-slack" },
    ]);
  });

  it("trims and limits the name, and never clears it", () => {
    const long = "n".repeat(WORKSPACE_AUTOMATION_NAME_MAX_CHARS + 10);

    expect(
      normalizeWorkspaceAutomationProposal(
        proposalInput({ name: "  Weekly digest " }),
        proposalBase(),
      ).name,
    ).toBe("Weekly digest");
    expect(
      normalizeWorkspaceAutomationProposal(proposalInput({ name: long }), proposalBase()).name,
    ).toHaveLength(WORKSPACE_AUTOMATION_NAME_MAX_CHARS);
    expect(
      normalizeWorkspaceAutomationProposal(proposalInput({ name: "   " }), proposalBase()).name,
    ).toBeNull();
  });

  it("keeps empty instructions as a request to clear them", () => {
    const long = "i".repeat(WORKSPACE_AUTOMATION_INSTRUCTIONS_MAX_CHARS + 10);

    expect(
      normalizeWorkspaceAutomationProposal(proposalInput({ instructions: "  " }), proposalBase())
        .instructions,
    ).toBe("");
    expect(
      normalizeWorkspaceAutomationProposal(proposalInput({ instructions: long }), proposalBase())
        .instructions,
    ).toHaveLength(WORKSPACE_AUTOMATION_INSTRUCTIONS_MAX_CHARS);
    expect(
      normalizeWorkspaceAutomationProposal(proposalInput(), proposalBase()).instructions,
    ).toBeNull();
  });

  it("keeps only the schedule fields the cadence uses", () => {
    const schedule = (cadence: "hourly" | "daily" | "weekly") =>
      normalizeWorkspaceAutomationProposal(
        proposalInput({
          trigger: triggerInput({ mode: "scheduled", cadence, hour: 9, dayOfWeek: 1 }),
        }),
        proposalBase(),
      ).trigger;

    expect(schedule("hourly")).toMatchObject({ hour: null, dayOfWeek: null });
    expect(schedule("daily")).toMatchObject({ hour: 9, dayOfWeek: null });
    expect(schedule("weekly")).toMatchObject({ hour: 9, dayOfWeek: 1 });
  });

  it("starts a new schedule in the person's time zone", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "scheduled", cadence: "daily", hour: 9 }) }),
      proposalBase(),
    );

    expect(proposal.trigger).toMatchObject({ timeZone: BROWSER_TIME_ZONE });
    expect(proposal.notes).toEqual([]);
  });

  it("leaves the time zone of an existing schedule alone", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "scheduled", cadence: "weekly" }) }),
      proposalBase({ triggerMode: "scheduled" }),
    );

    expect(proposal.trigger).toMatchObject({ timeZone: null });
  });

  it("keeps a valid time zone and reports one it does not recognise", () => {
    const named = normalizeWorkspaceAutomationProposal(
      proposalInput({
        trigger: triggerInput({ mode: "scheduled", cadence: "daily", timeZone: "Europe/Berlin" }),
      }),
      proposalBase(),
    );
    const unknown = normalizeWorkspaceAutomationProposal(
      proposalInput({
        trigger: triggerInput({ mode: "scheduled", cadence: "daily", timeZone: "Sydney time" }),
      }),
      proposalBase(),
    );

    expect(named.trigger).toMatchObject({ timeZone: "Europe/Berlin" });
    expect(unknown.trigger).toMatchObject({ timeZone: BROWSER_TIME_ZONE });
    expect(unknown.notes).toEqual([{ code: "time_zone_not_recognised" }]);
  });

  it("keeps valid branch patterns and reports the ones it drops", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({
        trigger: triggerInput({
          mode: "github",
          githubEvents: ["push", "push"],
          branches: ["main", "release/*", "main", "has space"],
        }),
      }),
      proposalBase(),
    );

    expect(proposal.trigger).toEqual({
      mode: "github",
      events: ["push"],
      branches: ["main", "release/*"],
    });
    expect(proposal.notes).toEqual([{ code: "branch_pattern_dropped" }]);
  });

  it("leaves the branches alone when none of the given patterns is valid", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "github", branches: ["has space"] }) }),
      proposalBase(),
    );

    expect(proposal.trigger).toEqual({ mode: "github", events: null, branches: null });
  });

  it("runs a new GitHub trigger on pull requests when the comment skill is added", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({
        trigger: triggerInput({ mode: "github" }),
        addSkillIds: ["comment-on-pull-request"],
      }),
      proposalBase(),
    );

    expect(proposal.trigger).toMatchObject({ mode: "github", events: ["pull_request"] });
  });

  it("keeps the events of an existing GitHub trigger when the comment skill is added", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({
        trigger: triggerInput({ mode: "github" }),
        addSkillIds: ["comment-on-pull-request"],
      }),
      proposalBase({ triggerMode: "github" }),
    );

    expect(proposal.trigger).toMatchObject({ mode: "github", events: null });
  });

  it("sets the trigger a skill needs when the setup is still on manual", () => {
    const comment = normalizeWorkspaceAutomationProposal(
      proposalInput({ addSkillIds: ["research-web", "comment-on-pull-request"] }),
      proposalBase(),
    );
    const upload = normalizeWorkspaceAutomationProposal(
      proposalInput({ addSkillIds: ["translate-uploaded-source"] }),
      proposalBase(),
    );

    expect(comment.trigger).toEqual({ mode: "github", events: ["pull_request"], branches: null });
    expect(comment.notes).toEqual([
      { code: "trigger_set_for_skill", skillId: "comment-on-pull-request" },
    ]);
    expect(upload.trigger).toEqual({ mode: "source_upload" });
  });

  it("sets no trigger for a skill that runs on the current one", () => {
    expect(
      normalizeWorkspaceAutomationProposal(
        proposalInput({ addSkillIds: ["research-web"] }),
        proposalBase(),
      ).trigger,
    ).toBeNull();
    expect(
      normalizeWorkspaceAutomationProposal(
        proposalInput({ addSkillIds: ["comment-on-pull-request"] }),
        proposalBase({ triggerMode: "scheduled" }),
      ).trigger,
    ).toBeNull();
  });

  it("detaches attached skills the new trigger cannot run", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "scheduled", cadence: "daily", hour: 9 }) }),
      proposalBase({
        triggerMode: "github",
        skillIds: ["review-translation-changes", "comment-on-pull-request"],
      }),
    );

    expect(proposal.removeSkillIds).toEqual(["comment-on-pull-request"]);
    expect(proposal.notes).toEqual([
      { code: "skill_removed_for_trigger", skillId: "comment-on-pull-request" },
    ]);
  });

  it("attaches the skill that does the work of a source upload or Contentful trigger", () => {
    const upload = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "source_upload" }) }),
      proposalBase(),
    );
    const contentful = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "contentful" }) }),
      proposalBase(),
    );

    expect(upload.addSkillIds).toEqual(["translate-uploaded-source"]);
    expect(upload.notes).toEqual([
      { code: "skill_added_for_trigger", skillId: "translate-uploaded-source" },
    ]);
    expect(contentful.addSkillIds).toEqual(["translate-contentful-entries"]);
  });

  it("does not attach a trigger's skill twice or against a request to remove it", () => {
    const attached = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "contentful" }) }),
      proposalBase({ triggerMode: "scheduled", skillIds: ["translate-contentful-entries"] }),
    );
    const requested = normalizeWorkspaceAutomationProposal(
      proposalInput({
        trigger: triggerInput({ mode: "source_upload" }),
        addSkillIds: ["translate-uploaded-source"],
      }),
      proposalBase(),
    );
    const unchanged = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "source_upload" }) }),
      proposalBase({ triggerMode: "source_upload" }),
    );

    expect(attached.addSkillIds).toEqual([]);
    expect(requested.addSkillIds).toEqual(["translate-uploaded-source"]);
    expect(requested.notes).toEqual([]);
    expect(unchanged.addSkillIds).toEqual([]);
  });

  it.each(Object.entries(WORKSPACE_AUTOMATION_TRIGGER_WORK_SKILL_IDS))(
    "names a skill that runs on the %s trigger",
    (mode, skillId) => {
      expect(getWorkspaceAutomationSkill(skillId)?.triggers).toContain(mode);
    },
  );

  it("keeps attached skills when the trigger mode does not change", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({ trigger: triggerInput({ mode: "github", branches: ["develop"] }) }),
      proposalBase({ triggerMode: "github", skillIds: ["comment-on-pull-request"] }),
    );

    expect(proposal.removeSkillIds).toEqual([]);
  });

  it("produces a proposal its own schema accepts", () => {
    const proposal = normalizeWorkspaceAutomationProposal(
      proposalInput({
        name: "Weekly digest",
        instructions: "Keep it short.",
        trigger: triggerInput({
          mode: "scheduled",
          cadence: "weekly",
          hour: 9,
          dayOfWeek: 1,
          timeZone: "nowhere",
        }),
        addSkillIds: ["summarize-localisation-changes", "post-to-slack", "unknown"],
        removeSkillIds: ["comment-on-pull-request"],
      }),
      proposalBase({ triggerMode: "github", skillIds: ["comment-on-pull-request"] }),
    );

    expect(workspaceAutomationProposalSchema.parse(proposal)).toEqual(proposal);
  });
});

describe("isWorkspaceAutomationProposalEmpty", () => {
  it("is true only when nothing would change", () => {
    const empty = normalizeWorkspaceAutomationProposal(
      proposalInput({ addSkillIds: ["unknown"] }),
      proposalBase(),
    );
    const named = normalizeWorkspaceAutomationProposal(
      proposalInput({ name: "Digest" }),
      proposalBase(),
    );

    expect(isWorkspaceAutomationProposalEmpty(empty)).toBe(true);
    expect(isWorkspaceAutomationProposalEmpty(named)).toBe(false);
  });
});
