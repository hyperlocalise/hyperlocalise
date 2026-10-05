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
  "list_issues",
  "create_issue",
  "notify_slack",
  "notify_email",
  "notify_github_comment",
] as const;

export type WorkspaceAutomationSkillTool = (typeof WORKSPACE_AUTOMATION_SKILL_TOOLS)[number];

export type WorkspaceAutomationSkillTrigger = WorkspaceAutomationTriggerConfig["mode"];

/** One term, or alternatives for the same idea that count as a single match. */
export type WorkspaceAutomationKeywordTerm = string | readonly string[];

/**
 * Terms matched as whole words against what the user typed. A strong term suggests the item on
 * its own; weak terms only count when two different ones match.
 */
export type WorkspaceAutomationKeywords = {
  strong: readonly WorkspaceAutomationKeywordTerm[];
  weak: readonly WorkspaceAutomationKeywordTerm[];
  /** Strong signals that are not plain words, such as an email address. */
  patterns?: readonly RegExp[];
};

/**
 * A suggestion is only an offer, so a wrong one costs less than a missing one: naming a pull
 * request suggests both reading it and commenting on it.
 */
const PULL_REQUEST_KEYWORDS = ["pull request", "pr"] as const;

/** Shared by everything that reads a repository, so naming a repository alone suggests nothing. */
export const REPOSITORY_KEYWORDS = ["github", "repo", "repository"] as const;

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
  keywords: WorkspaceAutomationKeywords;
  /** What the skill does that cannot be undone. The user confirms this before it is attached. */
  risk?: string;
};

const REPOSITORY_TRIGGERS = ["manual", "scheduled", "github"] as const;
/** Every trigger whose runs go through the orchestrator. Web chat runs a different agent. */
const ORCHESTRATED_TRIGGERS = [
  "manual",
  "scheduled",
  "github",
  "contentful",
  "source_upload",
] as const;

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
    keywords: {
      strong: [
        "translation review",
        ["localisation review", "localization review"],
        ["code review", "review code", "review changes"],
        ["hard coded", "hardcoded"],
        "missing translation",
        "placeholder",
        "icu",
        PULL_REQUEST_KEYWORDS,
      ],
      weak: [["review", "audit"], ["commit", "diff"], "i18n", "risk", REPOSITORY_KEYWORDS],
    },
  },
  {
    id: "summarize-localisation-changes",
    name: "Summarise localisation changes",
    description: "Write a short digest of localisation-related changes in the repository.",
    grants: "Reads the connected GitHub repository. Changes nothing.",
    tools: ["use_github_repository"],
    triggers: REPOSITORY_TRIGGERS,
    sharedSkills: [],
    keywords: {
      strong: [
        "changelog",
        "what changed",
        ["summarise changes", "summarize changes", "summary of changes"],
        ["localisation changes", "localization changes"],
      ],
      weak: [
        ["summarise", "summarize", "summary", "digest", "recap", "briefing"],
        ["commit", "change"],
        REPOSITORY_KEYWORDS,
      ],
    },
  },
  {
    id: "check-crowdin-concordance",
    name: "Check against Crowdin",
    description:
      "Check strings under review against the Crowdin glossary, translation memory and style guide.",
    grants: "Reads your Crowdin project. Changes nothing.",
    tools: ["use_crowdin"],
    triggers: ORCHESTRATED_TRIGGERS,
    sharedSkills: ["crowdin-concordance-review"],
    keywords: {
      strong: ["crowdin", "concordance"],
      weak: [
        ["glossary", "glossaries", "terminology"],
        ["translation memory", "tm"],
        "style guide",
      ],
    },
  },
  {
    id: "research-web",
    name: "Research the web",
    description:
      "Search the live web for competitor, market and localisation changes, with sources.",
    grants: "Searches the public web. Changes nothing.",
    tools: ["use_web_search"],
    triggers: ORCHESTRATED_TRIGGERS,
    sharedSkills: [],
    keywords: {
      strong: [
        ["web search", "search the web", "search the internet"],
        "research",
        "competitor",
        "news",
      ],
      weak: ["market", "pricing", "trend", "industry", ["source", "citation"], "latest"],
    },
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
    keywords: {
      strong: [
        ["source upload", "uploaded file", "uploaded source", "source file"],
        "translation job",
        ["create job", "create a job"],
        "translate with agent",
      ],
      weak: [["upload", "uploaded"], "translate", "target locale"],
    },
  },
  {
    id: "translate-contentful-entries",
    name: "Translate Contentful entries",
    description: "Translate Contentful entries, run QA and write localized drafts for review.",
    grants: "Reads Contentful entries and writes localized drafts. Never publishes.",
    tools: ["run_contentful_translation"],
    triggers: ["contentful", "manual", "scheduled"],
    sharedSkills: [],
    keywords: {
      strong: ["contentful"],
      weak: [
        "cms",
        ["entry", "entries"],
        ["article", "help center", "help centre"],
        "rich text",
        "draft",
        "translate",
      ],
    },
  },
  {
    id: "file-issues-for-findings",
    name: "File issues for findings",
    description:
      "Check the project's open Queries issues, then file one issue for each new finding.",
    grants: "Reads and creates Queries issues in the project, up to 20 in a run.",
    tools: ["list_issues", "create_issue"],
    triggers: ORCHESTRATED_TRIGGERS,
    sharedSkills: [],
    keywords: {
      strong: [["open issue", "existing issue", "list issues"]],
      weak: ["queries", "ticket", "issue", ["backlog", "triage"], ["track", "follow up"]],
      // "open a new issue", "file tickets", "raise a query": a verb, a few filler words, the noun.
      patterns: [
        /(?<![\p{L}\p{N}])(?:open(?:s|ing)?|creat(?:e|es|ing)|fil(?:e|es|ing)|rais(?:e|es|ing)|log(?:s|ging)?|submit(?:s|ting)?)[\s-]+(?:(?:a|an|the|new|one|another|separate)[\s-]+){0,3}(?:issues?|tickets?|query|queries)(?![\p{L}\p{N}])/iu,
      ],
    },
  },
  {
    id: "post-to-slack",
    name: "Post results to Slack",
    description: "Post the outcome of each run to a Slack channel.",
    grants: "Posts messages to the Slack channel you choose.",
    tools: ["notify_slack"],
    triggers: ORCHESTRATED_TRIGGERS,
    sharedSkills: [],
    keywords: {
      strong: ["slack"],
      weak: ["channel", ["notify", "alert", "ping"]],
      patterns: [/(?<![\p{L}\p{N}])#[a-z][a-z0-9_-]+/iu],
    },
  },
  {
    id: "email-results",
    name: "Email results",
    description: "Email the outcome of each run to the people you list.",
    grants: "Sends email from your connected sender to the recipients you list.",
    tools: ["notify_email"],
    triggers: ORCHESTRATED_TRIGGERS,
    sharedSkills: [],
    keywords: {
      strong: [["email", "e-mail"], "inbox"],
      weak: ["recipient", ["notify", "alert"]],
      patterns: [/[\w.+-]+@[\w-]+\.[\w.-]+/u],
    },
    risk: "Emails are sent as soon as a run finishes and cannot be recalled. They go from your connected sender to every recipient you list, and the agent writes the text.",
  },
  {
    id: "comment-on-pull-request",
    name: "Comment on the pull request",
    description: "Post findings as one pull request comment and keep it up to date.",
    grants: "Posts one comment on the pull request and updates it in place.",
    tools: ["notify_github_comment"],
    triggers: ["github"],
    sharedSkills: [],
    keywords: {
      strong: [PULL_REQUEST_KEYWORDS, "sticky comment"],
      weak: ["comment", "merge"],
    },
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

/** Integrations a skill's tools reach. A tool with none needs nothing connected. */
export type WorkspaceAutomationSkillIntegration =
  | "github"
  | "crowdin"
  | "contentful"
  | "slack"
  | "email";

const SKILL_TOOL_INTEGRATIONS: Record<
  WorkspaceAutomationSkillTool,
  WorkspaceAutomationSkillIntegration | null
> = {
  use_github_repository: "github",
  use_crowdin: "crowdin",
  use_web_search: null,
  run_contentful_translation: "contentful",
  create_native_tms_job: null,
  assign_translate_with_agent: null,
  list_issues: null,
  create_issue: null,
  notify_slack: "slack",
  notify_email: "email",
  notify_github_comment: "github",
};

/**
 * Whether each integration is connected. Only an explicit `false` counts as not connected, so a
 * status that is still loading, or failed to load, does not block anything.
 */
export type WorkspaceAutomationSkillConnections = Partial<
  Record<WorkspaceAutomationSkillIntegration, boolean>
>;

/** Integrations the skill needs that are known to be disconnected. */
export function listMissingWorkspaceAutomationSkillIntegrations(
  skill: WorkspaceAutomationSkill,
  connections: WorkspaceAutomationSkillConnections,
): WorkspaceAutomationSkillIntegration[] {
  const needed = skill.tools
    .map((tool) => SKILL_TOOL_INTEGRATIONS[tool])
    .filter(
      (integration): integration is WorkspaceAutomationSkillIntegration => integration !== null,
    );
  return [...new Set(needed)].filter((integration) => connections[integration] === false);
}

/** Names of the attached skills that declare each tool. */
export function listWorkspaceAutomationSkillNamesByTool(
  skillIds: readonly string[],
): Map<WorkspaceAutomationSkillTool, string[]> {
  const namesByTool = new Map<WorkspaceAutomationSkillTool, string[]>();
  for (const skill of resolveWorkspaceAutomationSkills(skillIds)) {
    for (const tool of skill.tools) {
      namesByTool.set(tool, [...(namesByTool.get(tool) ?? []), skill.name]);
    }
  }
  return namesByTool;
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
    case "list_issues":
      return Boolean(toolConfig.listIssues?.enabled);
    case "create_issue":
      return Boolean(toolConfig.createIssue?.enabled);
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
