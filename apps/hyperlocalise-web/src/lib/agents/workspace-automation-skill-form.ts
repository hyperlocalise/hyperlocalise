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
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import {
  getWorkspaceAutomationSkill,
  listWorkspaceAutomationSkillTools,
  workspaceAutomationSkillSupportsTrigger,
  type WorkspaceAutomationSkill,
  type WorkspaceAutomationSkillTool,
} from "./workspace-automation-skills";
import type { WorkspaceAutomationFormState } from "./workspace-automation-view-model";

/** Settings a skill cannot know, used only where the form has no value yet. */
export type WorkspaceAutomationSkillDefaults = {
  githubInstallationRepositoryId?: string;
  crowdinProjectId?: string;
  contentfulConnectionId?: string;
};

export type WorkspaceAutomationSkillAvailability = "available" | "attached" | "trigger_mismatch";

function enableSkillTool(
  form: WorkspaceAutomationFormState,
  tool: WorkspaceAutomationSkillTool,
  defaults: WorkspaceAutomationSkillDefaults,
): WorkspaceAutomationFormState {
  const githubRepositoryId =
    form.githubInstallationRepositoryId || defaults.githubInstallationRepositoryId || "";

  switch (tool) {
    case "use_github_repository":
      if (form.githubEnabled && form.githubMode === "agent") {
        return form;
      }
      return {
        ...form,
        githubEnabled: true,
        githubMode: "agent",
        repositoryTargetKind: "github",
        githubInstallationRepositoryId: githubRepositoryId,
        gitlabEnabled: false,
        gitlabPathWithNamespace: "",
        pushSourceEnabled: false,
        pullTranslationsEnabled: false,
        validationEnabled: false,
      };
    case "notify_github_comment":
      return {
        ...form,
        githubCommentEnabled: true,
        repositoryTargetKind: "github",
        githubInstallationRepositoryId: githubRepositoryId,
        gitlabEnabled: false,
        gitlabPathWithNamespace: "",
      };
    case "use_crowdin":
      return {
        ...form,
        crowdinEnabled: true,
        crowdinProjectId: form.crowdinProjectId || defaults.crowdinProjectId || "",
      };
    case "use_web_search":
      return { ...form, webSearchEnabled: true };
    case "run_contentful_translation":
      return {
        ...form,
        contentfulEnabled: true,
        contentfulConnectionId:
          form.contentfulConnectionId || defaults.contentfulConnectionId || "",
      };
    case "create_native_tms_job":
      return { ...form, createNativeTmsJobEnabled: true };
    case "assign_translate_with_agent":
      return { ...form, assignTranslateWithAgentEnabled: true };
    case "notify_slack":
      return { ...form, slackEnabled: true };
    case "notify_email":
      return { ...form, emailEnabled: true };
    default:
      return assertNever(tool);
  }
}

function disableSkillTool(
  form: WorkspaceAutomationFormState,
  tool: WorkspaceAutomationSkillTool,
): WorkspaceAutomationFormState {
  switch (tool) {
    case "use_github_repository":
      if (!form.githubEnabled || form.githubMode !== "agent") {
        return form;
      }
      return {
        ...form,
        githubEnabled: false,
        repositoryTargetKind: form.githubCommentEnabled ? "github" : "none",
        githubInstallationRepositoryId: form.githubCommentEnabled
          ? form.githubInstallationRepositoryId
          : "",
      };
    case "notify_github_comment":
      return {
        ...form,
        githubCommentEnabled: false,
        repositoryTargetKind: form.githubEnabled ? "github" : "none",
        githubInstallationRepositoryId: form.githubEnabled
          ? form.githubInstallationRepositoryId
          : "",
      };
    case "use_crowdin":
      return { ...form, crowdinEnabled: false, crowdinProjectId: "" };
    case "use_web_search":
      return { ...form, webSearchEnabled: false };
    case "run_contentful_translation":
      return { ...form, contentfulEnabled: false };
    case "create_native_tms_job":
      return { ...form, createNativeTmsJobEnabled: false };
    case "assign_translate_with_agent":
      return { ...form, assignTranslateWithAgentEnabled: false };
    case "notify_slack":
      return { ...form, slackEnabled: false, slackChannelId: "" };
    case "notify_email":
      return { ...form, emailEnabled: false, emailRecipients: [], emailFrom: "" };
    default:
      return assertNever(tool);
  }
}

/** Tools the attached skills need. The editor does not offer to remove these one by one. */
export function listWorkspaceAutomationFormSkillTools(
  form: Pick<WorkspaceAutomationFormState, "skillIds">,
): Set<WorkspaceAutomationSkillTool> {
  return new Set(listWorkspaceAutomationSkillTools(form.skillIds));
}

export function resolveWorkspaceAutomationSkillAvailability(
  form: Pick<WorkspaceAutomationFormState, "skillIds" | "triggerMode">,
  skill: WorkspaceAutomationSkill,
): WorkspaceAutomationSkillAvailability {
  if (form.skillIds.includes(skill.id)) {
    return "attached";
  }
  // A manual trigger is the untouched default, so a skill may replace it with its own.
  if (
    form.triggerMode !== "manual" &&
    !workspaceAutomationSkillSupportsTrigger(skill, form.triggerMode)
  ) {
    return "trigger_mismatch";
  }
  return "available";
}

/** Switches on every tool the form's skills declare. */
export function applySkillToolsToWorkspaceAutomationForm(
  form: WorkspaceAutomationFormState,
  defaults: WorkspaceAutomationSkillDefaults = {},
): WorkspaceAutomationFormState {
  return listWorkspaceAutomationSkillTools(form.skillIds).reduce(
    (next, tool) => enableSkillTool(next, tool, defaults),
    form,
  );
}

export function addSkillToWorkspaceAutomationForm(
  form: WorkspaceAutomationFormState,
  skillId: string,
  defaults: WorkspaceAutomationSkillDefaults = {},
): WorkspaceAutomationFormState {
  const skill = getWorkspaceAutomationSkill(skillId);
  if (!skill || resolveWorkspaceAutomationSkillAvailability(form, skill) !== "available") {
    return form;
  }

  const firstTrigger = skill.triggers[0];
  const needsOwnTrigger =
    firstTrigger !== undefined &&
    !workspaceAutomationSkillSupportsTrigger(skill, form.triggerMode);
  const withTrigger: WorkspaceAutomationFormState = needsOwnTrigger
    ? {
        ...form,
        triggerMode: firstTrigger,
        githubEvents:
          firstTrigger === "github" && skill.tools.includes("notify_github_comment")
            ? ["pull_request"]
            : form.githubEvents,
      }
    : form;

  return applySkillToolsToWorkspaceAutomationForm(
    { ...withTrigger, skillIds: [...form.skillIds, skill.id] },
    defaults,
  );
}

/** Detaches the skill and switches off its tools that no remaining skill declares. */
export function removeSkillFromWorkspaceAutomationForm(
  form: WorkspaceAutomationFormState,
  skillId: string,
): WorkspaceAutomationFormState {
  if (!form.skillIds.includes(skillId)) {
    return form;
  }

  const skillIds = form.skillIds.filter((id) => id !== skillId);
  const stillNeeded = new Set(listWorkspaceAutomationSkillTools(skillIds));
  const orphaned = (getWorkspaceAutomationSkill(skillId)?.tools ?? []).filter(
    (tool) => !stillNeeded.has(tool),
  );

  return orphaned.reduce((next, tool) => disableSkillTool(next, tool), { ...form, skillIds });
}
