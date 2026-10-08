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
  resolveWorkspaceAutomationSkills,
  workspaceAutomationSkillSupportsTrigger,
  type WorkspaceAutomationSkill,
  type WorkspaceAutomationSkillTool,
  type WorkspaceAutomationSkillTrigger,
} from "./workspace-automation-skills";
import type {
  WorkspaceAutomationFieldErrors,
  WorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

/** Settings a skill cannot know, used only where the form has no value yet. */
export type WorkspaceAutomationSkillDefaults = {
  githubInstallationRepositoryId?: string;
  crowdinProjectId?: string;
  contentfulConnectionId?: string;
};

export type WorkspaceAutomationSkillAvailability = "available" | "attached" | "trigger_mismatch";

export type WorkspaceAutomationSetupField = keyof WorkspaceAutomationFieldErrors;

/**
 * The settings each skill tool owns: what the person fills in once the tool is on. A field owned
 * by no skill tool, such as the name or the trigger, belongs to the setup as a whole.
 */
export const WORKSPACE_AUTOMATION_SKILL_TOOL_FIELDS: Record<
  WorkspaceAutomationSkillTool,
  readonly WorkspaceAutomationSetupField[]
> = {
  use_github_repository: ["githubRepository"],
  notify_github_comment: ["githubRepository"],
  use_crowdin: ["crowdinProjectId"],
  use_web_search: [],
  run_contentful_translation: [
    "contentfulConnectionId",
    "contentfulTargetLocales",
    "contentfulEntryId",
    "projectId",
  ],
  create_native_tms_job: ["projectId", "createNativeTmsJobTargetLocales"],
  assign_translate_with_agent: ["projectId"],
  list_issues: ["projectId"],
  create_issue: ["projectId"],
  notify_slack: ["slackChannelId"],
  notify_email: ["emailRecipients", "emailFrom"],
  import_intercom_articles: ["intercomHelpCenterId", "projectId"],
  push_intercom_translations: ["intercomHelpCenterId", "projectId"],
};

/** Ids of the given skills whose tools own the field, in the order given. */
export function listWorkspaceAutomationSetupFieldOwners(
  skillIds: readonly string[],
  field: WorkspaceAutomationSetupField,
): string[] {
  return resolveWorkspaceAutomationSkills(skillIds)
    .filter((skill) =>
      skill.tools.some((tool) => WORKSPACE_AUTOMATION_SKILL_TOOL_FIELDS[tool].includes(field)),
    )
    .map((skill) => skill.id);
}

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
    case "import_intercom_articles":
    case "push_intercom_translations":
      return {
        ...form,
        intercomEnabled: true,
      };
    case "create_native_tms_job":
      return { ...form, createNativeTmsJobEnabled: true };
    case "assign_translate_with_agent":
      return { ...form, assignTranslateWithAgentEnabled: true };
    case "list_issues":
      return { ...form, listIssuesEnabled: true };
    case "create_issue":
      return { ...form, createIssueEnabled: true };
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
    case "import_intercom_articles":
    case "push_intercom_translations":
      return { ...form, intercomEnabled: false };
    case "create_native_tms_job":
      return { ...form, createNativeTmsJobEnabled: false };
    case "assign_translate_with_agent":
      return { ...form, assignTranslateWithAgentEnabled: false };
    case "list_issues":
      return { ...form, listIssuesEnabled: false };
    case "create_issue":
      return { ...form, createIssueEnabled: false };
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

/**
 * The trigger the form would have with the skill attached, or null when the skill cannot be
 * attached. A manual trigger is the untouched default, so a skill that needs another trigger may
 * replace it, but only with one the skills already attached work with too.
 */
function resolveTriggerWithSkill(
  form: Pick<WorkspaceAutomationFormState, "skillIds" | "triggerMode">,
  skill: WorkspaceAutomationSkill,
): WorkspaceAutomationSkillTrigger | null {
  if (workspaceAutomationSkillSupportsTrigger(skill, form.triggerMode)) {
    return form.triggerMode;
  }
  if (form.triggerMode !== "manual") {
    return null;
  }

  const attachedSkills = resolveWorkspaceAutomationSkills(form.skillIds);
  return (
    skill.triggers.find((trigger) =>
      attachedSkills.every((attached) =>
        workspaceAutomationSkillSupportsTrigger(attached, trigger),
      ),
    ) ?? null
  );
}

export function resolveWorkspaceAutomationSkillAvailability(
  form: Pick<WorkspaceAutomationFormState, "skillIds" | "triggerMode">,
  skill: WorkspaceAutomationSkill,
): WorkspaceAutomationSkillAvailability {
  if (form.skillIds.includes(skill.id)) {
    return "attached";
  }
  return resolveTriggerWithSkill(form, skill) === null ? "trigger_mismatch" : "available";
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
  if (!skill || form.skillIds.includes(skill.id)) {
    return form;
  }
  const triggerMode = resolveTriggerWithSkill(form, skill);
  if (triggerMode === null) {
    return form;
  }

  const withTrigger: WorkspaceAutomationFormState =
    triggerMode === form.triggerMode
      ? form
      : {
          ...form,
          triggerMode,
          githubEvents:
            triggerMode === "github" && skill.tools.includes("notify_github_comment")
              ? ["pull_request"]
              : form.githubEvents,
        };

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
