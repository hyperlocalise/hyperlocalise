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
  listWorkspaceAutomationFormSkillTools,
  resolveWorkspaceAutomationSkillAvailability,
} from "./workspace-automation-skill-form";
import {
  REPOSITORY_KEYWORDS,
  WORKSPACE_AUTOMATION_SKILLS,
  workspaceAutomationSkillToolEnabled,
  type WorkspaceAutomationKeywords,
  type WorkspaceAutomationKeywordTerm,
  type WorkspaceAutomationSkill,
} from "./workspace-automation-skills";
import {
  formStateToWorkspaceAutomationPayload,
  type WorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

const STRONG_MATCH_SCORE = 10;
const WEAK_MATCHES_TO_SUGGEST = 2;
export const MAX_WORKSPACE_AUTOMATION_SUGGESTIONS = 5;

/** Tools no skill covers. They are suggested, and switched on, directly. */
export const WORKSPACE_AUTOMATION_SUGGESTED_TOOL_IDS = [
  "github_sync",
  "gitlab",
  "list_issues",
  "create_issue",
  "semrush",
  "ahrefs",
  "zernio",
] as const;

export type WorkspaceAutomationSuggestedToolId =
  (typeof WORKSPACE_AUTOMATION_SUGGESTED_TOOL_IDS)[number];

const SUGGESTED_TOOL_KEYWORDS: Record<
  WorkspaceAutomationSuggestedToolId,
  WorkspaceAutomationKeywords
> = {
  github_sync: {
    strong: [
      "push source",
      "pull translation",
      "hl check",
      "i18n.yml",
      ["sync", "synchronise", "synchronize"],
    ],
    weak: [["validation", "validate"], "coverage", REPOSITORY_KEYWORDS],
  },
  gitlab: { strong: ["gitlab", "merge request"], weak: [] },
  list_issues: {
    strong: [["open issue", "existing issue", "list issues"]],
    weak: ["queries", ["backlog", "triage"], "issue"],
  },
  create_issue: {
    strong: [
      [
        "file an issue",
        "file issues",
        "create issue",
        "create an issue",
        "open a ticket",
        "raise a query",
      ],
    ],
    weak: ["ticket", "issue", ["track", "follow up"]],
  },
  semrush: {
    strong: ["semrush", "keyword research", "search volume"],
    weak: ["seo", ["keyword", "ranking"], ["traffic", "organic"]],
  },
  ahrefs: {
    strong: ["ahrefs", ["backlink", "referring domain", "domain rating"]],
    weak: ["seo", ["keyword", "ranking"]],
  },
  zernio: {
    strong: ["zernio", ["paid ad", "ad campaign", "ad creative"]],
    weak: ["ads", ["campaign", "promote"]],
  },
};

/** Settings a suggested tool cannot know, used only where the form has no value yet. */
export type WorkspaceAutomationSuggestedToolDefaults = {
  githubInstallationRepositoryId?: string;
  gitlabPathWithNamespace?: string;
  semrushConnectionId?: string;
  zernioConnectionId?: string;
};

/** Whether the integration behind each suggested tool is connected. Missing means not connected. */
export type WorkspaceAutomationSuggestedToolConnections = Partial<
  Record<"github" | "gitlab" | "semrush" | "ahrefs" | "zernio", boolean>
>;

export type WorkspaceAutomationSuggestion =
  | {
      kind: "skill";
      key: string;
      skill: WorkspaceAutomationSkill;
      availability: "available" | "trigger_mismatch";
    }
  | {
      kind: "tool";
      key: string;
      toolId: WorkspaceAutomationSuggestedToolId;
      availability: "available" | "connect_first";
    };

const termPatterns = new Map<string, RegExp>();

function termPattern(term: string): RegExp {
  const cached = termPatterns.get(term);
  if (cached) {
    return cached;
  }

  const words = term
    .trim()
    .split(/[\s-]+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s-]+");
  // Whole words only, with a plain plural allowed, so "pr" matches "PRs" but not "sprint".
  const plural = /[a-z]$/i.test(term) ? "(?:e?s)?" : "";
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${words}${plural}(?![\\p{L}\\p{N}])`, "iu");
  termPatterns.set(term, pattern);
  return pattern;
}

function termMatches(text: string, term: WorkspaceAutomationKeywordTerm): boolean {
  const alternatives = typeof term === "string" ? [term] : term;
  return alternatives.some((alternative) => termPattern(alternative).test(text));
}

export function countWorkspaceAutomationKeywordMatches(
  text: string,
  keywords: WorkspaceAutomationKeywords,
): { strong: number; weak: number } {
  return {
    strong:
      keywords.strong.filter((term) => termMatches(text, term)).length +
      (keywords.patterns ?? []).filter((pattern) => pattern.test(text)).length,
    weak: keywords.weak.filter((term) => termMatches(text, term)).length,
  };
}

/** Zero when the text does not suggest the item. */
function scoreKeywords(text: string, keywords: WorkspaceAutomationKeywords): number {
  const matches = countWorkspaceAutomationKeywordMatches(text, keywords);
  if (matches.strong === 0 && matches.weak < WEAK_MATCHES_TO_SUGGEST) {
    return 0;
  }
  return matches.strong * STRONG_MATCH_SCORE + matches.weak;
}

function isSuggestedToolEnabled(
  form: WorkspaceAutomationFormState,
  toolId: WorkspaceAutomationSuggestedToolId,
): boolean {
  switch (toolId) {
    case "github_sync":
      return form.githubEnabled && form.githubMode === "sync";
    case "gitlab":
      return form.gitlabEnabled;
    case "list_issues":
      return form.listIssuesEnabled;
    case "create_issue":
      return form.createIssueEnabled;
    case "semrush":
      return form.semrushEnabled;
    case "ahrefs":
      return form.ahrefsEnabled;
    case "zernio":
      return form.zernioEnabled;
    default:
      return assertNever(toolId);
  }
}

/** Null when the tool is already on or cannot be combined with what the form has. */
function resolveSuggestedToolAvailability(
  form: WorkspaceAutomationFormState,
  toolId: WorkspaceAutomationSuggestedToolId,
  connections: WorkspaceAutomationSuggestedToolConnections,
): "available" | "connect_first" | null {
  if (isSuggestedToolEnabled(form, toolId)) {
    return null;
  }

  const requires = (connected: boolean | undefined) => (connected ? "available" : "connect_first");

  switch (toolId) {
    case "github_sync":
      return form.githubEnabled || form.gitlabEnabled ? null : requires(connections.github);
    case "gitlab":
      return form.githubEnabled || form.githubCommentEnabled ? null : requires(connections.gitlab);
    case "list_issues":
    case "create_issue":
      return "available";
    case "semrush":
      return requires(connections.semrush);
    case "ahrefs":
      return requires(connections.ahrefs);
    case "zernio":
      return requires(connections.zernio);
    default:
      return assertNever(toolId);
  }
}

/** The user already switched on everything the skill would add, without a skill. */
function skillToolsAddedByHand(
  form: WorkspaceAutomationFormState,
  skill: WorkspaceAutomationSkill,
): boolean {
  const fromSkills = listWorkspaceAutomationFormSkillTools(form);
  const { toolConfig } = formStateToWorkspaceAutomationPayload(form);
  return skill.tools.every(
    (tool) => !fromSkills.has(tool) && workspaceAutomationSkillToolEnabled(tool, toolConfig),
  );
}

/** Skills and tools the automation's name and instructions point to, best match first. */
export function suggestWorkspaceAutomationAdditions(input: {
  form: WorkspaceAutomationFormState;
  connections?: WorkspaceAutomationSuggestedToolConnections;
  dismissed?: ReadonlySet<string>;
}): WorkspaceAutomationSuggestion[] {
  const { form } = input;
  if (form.kind === "content_sync") {
    return [];
  }

  const text = `${form.name}\n${form.instructions}`;
  if (!text.trim()) {
    return [];
  }

  const scored: Array<{ score: number; suggestion: WorkspaceAutomationSuggestion }> = [];

  for (const skill of WORKSPACE_AUTOMATION_SKILLS) {
    const availability = resolveWorkspaceAutomationSkillAvailability(form, skill);
    if (availability === "attached" || skillToolsAddedByHand(form, skill)) {
      continue;
    }
    const score = scoreKeywords(text, skill.keywords);
    if (score > 0) {
      scored.push({
        score,
        suggestion: { kind: "skill", key: `skill:${skill.id}`, skill, availability },
      });
    }
  }

  for (const toolId of WORKSPACE_AUTOMATION_SUGGESTED_TOOL_IDS) {
    const availability = resolveSuggestedToolAvailability(form, toolId, input.connections ?? {});
    if (!availability) {
      continue;
    }
    const score = scoreKeywords(text, SUGGESTED_TOOL_KEYWORDS[toolId]);
    if (score > 0) {
      scored.push({
        score,
        suggestion: { kind: "tool", key: `tool:${toolId}`, toolId, availability },
      });
    }
  }

  return scored
    .filter(({ suggestion }) => !input.dismissed?.has(suggestion.key))
    .toSorted((left, right) => right.score - left.score)
    .slice(0, MAX_WORKSPACE_AUTOMATION_SUGGESTIONS)
    .map(({ suggestion }) => suggestion);
}

/** Switches a suggested tool on the same way the Add tool menu does. */
export function addSuggestedToolToWorkspaceAutomationForm(
  form: WorkspaceAutomationFormState,
  toolId: WorkspaceAutomationSuggestedToolId,
  defaults: WorkspaceAutomationSuggestedToolDefaults = {},
): WorkspaceAutomationFormState {
  switch (toolId) {
    case "github_sync":
      return {
        ...form,
        githubEnabled: true,
        githubMode: "sync",
        repositoryTargetKind: "github",
        githubInstallationRepositoryId:
          form.githubInstallationRepositoryId || defaults.githubInstallationRepositoryId || "",
        gitlabEnabled: false,
        gitlabPathWithNamespace: "",
        validationEnabled:
          form.pushSourceEnabled || form.pullTranslationsEnabled ? form.validationEnabled : true,
      };
    case "gitlab":
      return {
        ...form,
        gitlabEnabled: true,
        gitlabPathWithNamespace:
          form.gitlabPathWithNamespace || defaults.gitlabPathWithNamespace || "",
        repositoryTargetKind: "gitlab",
        githubEnabled: false,
        githubCommentEnabled: false,
        githubInstallationRepositoryId: "",
      };
    case "list_issues":
      return { ...form, listIssuesEnabled: true };
    case "create_issue":
      return { ...form, createIssueEnabled: true };
    case "semrush":
      return {
        ...form,
        semrushEnabled: true,
        semrushConnectionId: form.semrushConnectionId || defaults.semrushConnectionId || "",
      };
    case "ahrefs":
      return { ...form, ahrefsEnabled: true };
    case "zernio":
      return {
        ...form,
        zernioEnabled: true,
        zernioConnectionId: form.zernioConnectionId || defaults.zernioConnectionId || "",
      };
    default:
      return assertNever(toolId);
  }
}
