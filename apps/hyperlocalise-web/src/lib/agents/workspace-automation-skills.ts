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

import type {
  WorkspaceAutomationToolConfig,
  WorkspaceAutomationTriggerConfig,
} from "./workspace-automation-types";

export const WORKSPACE_AUTOMATION_SKILL_TOOLS = [
  "use_github_repository",
  "use_crowdin",
  "use_web_search",
  "run_contentful_translation",
  "create_native_tms_job",
  "assign_translate_with_agent",
  "notify_slack",
  "notify_email",
  "notify_github_comment",
] as const;

export type WorkspaceAutomationSkillTool = (typeof WORKSPACE_AUTOMATION_SKILL_TOOLS)[number];

export type WorkspaceAutomationSkillTrigger = WorkspaceAutomationTriggerConfig["mode"];

export type WorkspaceAutomationSkill = {
  /** Also the file name of the procedure under the workspace agent's skills folder. */
  id: string;
  name: string;
  description: string;
  /** Plain statement of what attaching the skill lets the automation touch. */
  grants: string;
  tools: readonly WorkspaceAutomationSkillTool[];
  triggers: readonly WorkspaceAutomationSkillTrigger[];
  sharedSkills: readonly string[];
};

const RUN_TRIGGERS = ["manual", "scheduled"] as const;
const REPOSITORY_TRIGGERS = ["manual", "scheduled", "github"] as const;
const DELIVERY_TRIGGERS = ["manual", "scheduled", "github", "contentful", "source_upload"] as const;

export const WORKSPACE_AUTOMATION_SKILLS: readonly WorkspaceAutomationSkill[] = [
  {
    id: "review-translation-changes",
    name: "Review translation changes",
    description:
      "Review recent repository changes key by key for localisation and translation risk.",
    grants: "Reads the connected GitHub repository. Changes nothing.",
    tools: ["use_github_repository"],
    triggers: REPOSITORY_TRIGGERS,
    sharedSkills: ["translation-review"],
  },
  {
    id: "summarize-localisation-changes",
    name: "Summarise localisation changes",
    description: "Write a short digest of localisation-related changes in the repository.",
    grants: "Reads the connected GitHub repository. Changes nothing.",
    tools: ["use_github_repository"],
    triggers: REPOSITORY_TRIGGERS,
    sharedSkills: [],
  },
  {
    id: "check-crowdin-concordance",
    name: "Check against Crowdin",
    description:
      "Check strings under review against the Crowdin glossary, translation memory and style guide.",
    grants: "Reads your Crowdin project. Changes nothing.",
    tools: ["use_crowdin"],
    triggers: REPOSITORY_TRIGGERS,
    sharedSkills: ["crowdin-concordance-review"],
  },
  {
    id: "research-web",
    name: "Research the web",
    description:
      "Search the live web for competitor, market and localisation changes, with sources.",
    grants: "Searches the public web. Changes nothing.",
    tools: ["use_web_search"],
    triggers: RUN_TRIGGERS,
    sharedSkills: [],
  },
  {
    id: "translate-uploaded-source",
    name: "Translate uploaded source files",
    description:
      "Create a translation job for each uploaded source file and translate it with the Hyperlocalise agent.",
    grants: "Creates translation jobs in the project and assigns them to the Hyperlocalise agent.",
    tools: ["create_native_tms_job", "assign_translate_with_agent"],
    triggers: ["source_upload"],
    sharedSkills: [],
  },
  {
    id: "translate-contentful-entries",
    name: "Translate Contentful entries",
    description: "Translate Contentful entries, run QA and write localized drafts for review.",
    grants: "Reads Contentful entries and writes localized drafts. Never publishes.",
    tools: ["run_contentful_translation"],
    triggers: ["contentful", "manual", "scheduled"],
    sharedSkills: [],
  },
  {
    id: "post-to-slack",
    name: "Post results to Slack",
    description: "Post the outcome of each run to a Slack channel.",
    grants: "Posts messages to the Slack channel you choose.",
    tools: ["notify_slack"],
    triggers: DELIVERY_TRIGGERS,
    sharedSkills: [],
  },
  {
    id: "email-results",
    name: "Email results",
    description: "Email the outcome of each run to the people you list.",
    grants: "Sends email from your connected sender to the recipients you list.",
    tools: ["notify_email"],
    triggers: DELIVERY_TRIGGERS,
    sharedSkills: [],
  },
  {
    id: "comment-on-pull-request",
    name: "Comment on the pull request",
    description: "Post findings as one pull request comment and keep it up to date.",
    grants: "Posts one comment on the pull request and updates it in place.",
    tools: ["notify_github_comment"],
    triggers: ["github"],
    sharedSkills: [],
  },
];

export const MAX_WORKSPACE_AUTOMATION_SKILLS = WORKSPACE_AUTOMATION_SKILLS.length;

export function getWorkspaceAutomationSkill(skillId: string): WorkspaceAutomationSkill | null {
  return WORKSPACE_AUTOMATION_SKILLS.find((skill) => skill.id === skillId) ?? null;
}

/** Known skills for the given ids, in the order given, without duplicates. */
export function resolveWorkspaceAutomationSkills(
  skillIds: readonly string[],
): WorkspaceAutomationSkill[] {
  return [...new Set(skillIds)]
    .map((skillId) => getWorkspaceAutomationSkill(skillId))
    .filter((skill): skill is WorkspaceAutomationSkill => skill !== null);
}

export function workspaceAutomationSkillSupportsTrigger(
  skill: WorkspaceAutomationSkill,
  trigger: WorkspaceAutomationSkillTrigger,
): boolean {
  return skill.triggers.includes(trigger);
}

export function listWorkspaceAutomationSkillTools(
  skillIds: readonly string[],
): WorkspaceAutomationSkillTool[] {
  return [
    ...new Set(resolveWorkspaceAutomationSkills(skillIds).flatMap((skill) => [...skill.tools])),
  ];
}

export type WorkspaceAutomationSkillValidationCode =
  | "skill_not_found"
  | "skill_trigger_incompatible"
  | "skill_tools_required";

/** First problem with the attached skills, or null when they fit the trigger and tool config. */
export function validateWorkspaceAutomationSkills(input: {
  skillIds: readonly string[];
  triggerMode: WorkspaceAutomationSkillTrigger;
  toolConfig: WorkspaceAutomationToolConfig;
}): WorkspaceAutomationSkillValidationCode | null {
  for (const skillId of input.skillIds) {
    const skill = getWorkspaceAutomationSkill(skillId);
    if (!skill) {
      return "skill_not_found";
    }
    if (!workspaceAutomationSkillSupportsTrigger(skill, input.triggerMode)) {
      return "skill_trigger_incompatible";
    }
    if (!skill.tools.every((tool) => workspaceAutomationSkillToolEnabled(tool, input.toolConfig))) {
      return "skill_tools_required";
    }
  }

  return null;
}

export function workspaceAutomationSkillToolEnabled(
  tool: WorkspaceAutomationSkillTool,
  toolConfig: WorkspaceAutomationToolConfig,
): boolean {
  switch (tool) {
    case "use_github_repository":
      return Boolean(toolConfig.github?.enabled && toolConfig.github.mode === "agent");
    case "use_crowdin":
      return Boolean(toolConfig.crowdin?.enabled);
    case "use_web_search":
      return Boolean(toolConfig.webSearch?.enabled);
    case "run_contentful_translation":
      return Boolean(toolConfig.contentful?.enabled);
    case "create_native_tms_job":
      return Boolean(toolConfig.createNativeTmsJob?.enabled);
    case "assign_translate_with_agent":
      return Boolean(toolConfig.assignTranslateWithAgent?.enabled);
    case "notify_slack":
      return Boolean(toolConfig.slack?.enabled);
    case "notify_email":
      return Boolean(toolConfig.email?.enabled);
    case "notify_github_comment":
      return Boolean(toolConfig.githubComment?.enabled);
    default:
      return assertNever(tool);
  }
}
