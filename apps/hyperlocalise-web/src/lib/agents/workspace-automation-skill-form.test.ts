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
  addSkillToWorkspaceAutomationForm,
  listWorkspaceAutomationFormSkillTools,
  removeSkillFromWorkspaceAutomationForm,
  resolveWorkspaceAutomationSkillAvailability,
} from "./workspace-automation-skill-form";
import { getWorkspaceAutomationSkill } from "./workspace-automation-skills";
import {
  createDefaultWorkspaceAutomationFormState,
  formStateToWorkspaceAutomationPayload,
  validateWorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

const SLACK_CHANNEL_ID = "C0123456789";

describe("workspace automation skill form", () => {
  it("switches on a skill's tools and prefills settings the form does not have", () => {
    const form = addSkillToWorkspaceAutomationForm(
      addSkillToWorkspaceAutomationForm(
        createDefaultWorkspaceAutomationFormState(),
        "review-translation-changes",
        { githubInstallationRepositoryId: "repo-1" },
      ),
      "check-crowdin-concordance",
      { crowdinProjectId: "crowdin-project" },
    );

    expect(form.skillIds).toEqual(["review-translation-changes", "check-crowdin-concordance"]);
    expect(form).toMatchObject({
      triggerMode: "manual",
      githubEnabled: true,
      githubMode: "agent",
      repositoryTargetKind: "github",
      githubInstallationRepositoryId: "repo-1",
      crowdinEnabled: true,
      crowdinProjectId: "crowdin-project",
    });
    expect([...listWorkspaceAutomationFormSkillTools(form)]).toEqual([
      "use_github_repository",
      "use_crowdin",
    ]);
  });

  it("keeps settings the form already has", () => {
    const form = addSkillToWorkspaceAutomationForm(
      { ...createDefaultWorkspaceAutomationFormState(), githubInstallationRepositoryId: "mine" },
      "review-translation-changes",
      { githubInstallationRepositoryId: "repo-1" },
    );

    expect(form.githubInstallationRepositoryId).toBe("mine");
  });

  it("moves an untouched manual trigger to the skill's own trigger", () => {
    const upload = addSkillToWorkspaceAutomationForm(
      createDefaultWorkspaceAutomationFormState(),
      "translate-uploaded-source",
    );
    const comment = addSkillToWorkspaceAutomationForm(
      createDefaultWorkspaceAutomationFormState(),
      "comment-on-pull-request",
    );

    expect(upload).toMatchObject({
      triggerMode: "source_upload",
      createNativeTmsJobEnabled: true,
      assignTranslateWithAgentEnabled: true,
    });
    expect(comment).toMatchObject({
      triggerMode: "github",
      githubEvents: ["pull_request"],
      githubCommentEnabled: true,
    });
  });

  it("does not attach a skill twice or one that does not fit the chosen trigger", () => {
    const scheduled = {
      ...createDefaultWorkspaceAutomationFormState(),
      triggerMode: "scheduled" as const,
    };
    const uploadSkill = getWorkspaceAutomationSkill("translate-uploaded-source");
    if (!uploadSkill) {
      throw new Error("missing skill");
    }

    expect(resolveWorkspaceAutomationSkillAvailability(scheduled, uploadSkill)).toBe(
      "trigger_mismatch",
    );
    expect(addSkillToWorkspaceAutomationForm(scheduled, uploadSkill.id)).toBe(scheduled);

    const attached = addSkillToWorkspaceAutomationForm(scheduled, "research-web");
    expect(addSkillToWorkspaceAutomationForm(attached, "research-web")).toBe(attached);
  });

  it("removes only the tools no remaining skill needs", () => {
    const withBoth = addSkillToWorkspaceAutomationForm(
      addSkillToWorkspaceAutomationForm(
        addSkillToWorkspaceAutomationForm(
          createDefaultWorkspaceAutomationFormState(),
          "review-translation-changes",
          { githubInstallationRepositoryId: "repo-1" },
        ),
        "summarize-localisation-changes",
      ),
      "post-to-slack",
    );

    const withoutReview = removeSkillFromWorkspaceAutomationForm(
      withBoth,
      "review-translation-changes",
    );
    expect(withoutReview.skillIds).toEqual(["summarize-localisation-changes", "post-to-slack"]);
    expect(withoutReview.githubEnabled).toBe(true);

    const withoutRepository = removeSkillFromWorkspaceAutomationForm(
      withoutReview,
      "summarize-localisation-changes",
    );
    expect(withoutRepository).toMatchObject({
      skillIds: ["post-to-slack"],
      githubEnabled: false,
      repositoryTargetKind: "none",
      githubInstallationRepositoryId: "",
      slackEnabled: true,
    });
  });

  it("switches both Queries tools on and off with the issue skill", () => {
    const attached = addSkillToWorkspaceAutomationForm(
      createDefaultWorkspaceAutomationFormState(),
      "file-issues-for-findings",
    );

    expect(attached).toMatchObject({ listIssuesEnabled: true, createIssueEnabled: true });
    expect(
      removeSkillFromWorkspaceAutomationForm(attached, "file-issues-for-findings"),
    ).toMatchObject({ skillIds: [], listIssuesEnabled: false, createIssueEnabled: false });
  });

  it("saves a skill-only automation without instructions", () => {
    const form = {
      ...addSkillToWorkspaceAutomationForm(
        addSkillToWorkspaceAutomationForm(
          { ...createDefaultWorkspaceAutomationFormState(), name: "Research brief" },
          "research-web",
        ),
        "post-to-slack",
      ),
      slackChannelId: SLACK_CHANNEL_ID,
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    expect(formStateToWorkspaceAutomationPayload(form)).toMatchObject({
      instructions: "",
      skillIds: ["research-web", "post-to-slack"],
      toolConfig: {
        webSearch: { enabled: true },
        slack: { enabled: true, channelId: SLACK_CHANNEL_ID },
      },
    });
  });

  it("reports a skill whose tool was switched off or whose trigger no longer fits", () => {
    const form = addSkillToWorkspaceAutomationForm(
      { ...createDefaultWorkspaceAutomationFormState(), name: "Research brief" },
      "research-web",
    );

    expect(validateWorkspaceAutomationFormState({ ...form, webSearchEnabled: false }).skills).toBe(
      "A selected skill needs a tool that was removed. Add the skill again.",
    );
    expect(validateWorkspaceAutomationFormState({ ...form, triggerMode: "web_chat" }).skills).toBe(
      "A selected skill does not work with this trigger. Remove it or change the trigger.",
    );
  });

  it("requires instructions when no skill is attached", () => {
    expect(
      validateWorkspaceAutomationFormState({
        ...createDefaultWorkspaceAutomationFormState(),
        name: "Empty",
      }).instructions,
    ).toBe("Add a skill or write instructions.");
  });
});
