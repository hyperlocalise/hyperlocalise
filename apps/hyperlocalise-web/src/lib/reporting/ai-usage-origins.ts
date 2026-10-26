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
/**
 * Where an AI call came from, for Reports' AI usage. Billing records each call under a `source`
 * (`usage_events.source`); a token row's own source is often generic, so the call is placed by its
 * parent row's source, found through `dimensions.parent_operation_key`. A one-off call (an editor
 * suggestion, a workflow's AI step) has no parent row and is placed by its own source. See the
 * research note "AI usage in Reports: origins" for how each source was traced.
 */

export const AI_ORIGINS = [
  "translation",
  "review_and_qa",
  "images_and_video",
  "assistants_and_chat",
  "building_automations",
  "running_automations",
  "other",
] as const;
export type AiOrigin = (typeof AI_ORIGINS)[number];

export const AI_CHANNELS = [
  "app",
  "api",
  "slack",
  "email",
  "web_chat",
  "github",
  "gitlab",
  "contentful",
  "connected_tms",
  "automation",
] as const;
export type AiChannel = (typeof AI_CHANNELS)[number];

/**
 * Whose provider key a call used, from billing's `credential_source`: our AI gateway, which uses
 * plan credit, or the workspace's own key. Rows from before billing recorded it have none.
 */
export const AI_KEY_TYPES = ["our_ai", "own_key", "not_recorded"] as const;
export type AiKeyType = (typeof AI_KEY_TYPES)[number];

/** The details AI usage can be grouped and narrowed by. */
export const AI_USAGE_DIMENSIONS = [
  "area",
  "feature",
  "model",
  "provider",
  "channel",
  "key",
  "project",
  "task",
  "automation",
] as const;
export type AiUsageDimension = (typeof AI_USAGE_DIMENSIONS)[number];

/** What AI usage's chart shows and its groups are ranked by: tokens, runs or AI credit used. */
export const AI_USAGE_MEASURES = ["tokens", "calls", "charge"] as const;
export type AiUsageMeasure = (typeof AI_USAGE_MEASURES)[number];

/** Sources of billing rows that each stand for one image or one video made. */
export const AI_IMAGE_SOURCES = [
  "project_image_variant",
  "project_image_url_translation",
  "slack_image_localization",
  "email_image_localization",
  "contentful_image_localization",
] as const;
export const AI_VIDEO_SOURCES = ["project_video_variant", "project_video_url_translation"] as const;

export const MEDIA_SOURCES = new Set<string>([...AI_IMAGE_SOURCES, ...AI_VIDEO_SOURCES]);

export const ORIGIN_BY_SOURCE: Record<string, AiOrigin> = {
  translation_job_create: "translation",
  email_translation_job_create: "translation",
  contentful_agent: "translation",
  contentful_field_translation: "translation",
  content_editor_ai_suggestion: "translation",
  content_editor_document_regenerate: "translation",
  chat_agent_turn: "assistants_and_chat",
  chat_translate_string: "assistants_and_chat",
  web_chat_agent_turn: "assistants_and_chat",
  slack_agent_turn: "assistants_and_chat",
  project_file_string_context_lookup: "assistants_and_chat",
  // Answers a person's @mention in a GitHub pull request.
  repository_agent_workflow: "assistants_and_chat",
  automation_assistant_turn: "building_automations",
  visual_workflow_ai_step: "running_automations",
  // Automatic localisation reviews of a GitHub commit or pull request.
  github_repository_commit_review: "review_and_qa",
  github_pull_request_review: "review_and_qa",
  // Reading the text in an image or a video frame: a call with tokens, not an image made.
  image_text_extraction: "images_and_video",
};

/** Kinds of agent runs on tasks from a connected TMS (`agent_runs.kind`). */
export const ORIGIN_BY_AGENT_RUN_KIND: Record<string, AiOrigin> = {
  translate: "translation",
  review: "review_and_qa",
  qa_fix: "review_and_qa",
  glossary_suggestion: "review_and_qa",
  comment_only: "review_and_qa",
};

/**
 * A rule placing a source: the whole name, or a name's start. Rules are tried in order, and the
 * Reports queries turn the same rules into SQL, so the page and the database never disagree.
 */
export type SourceRule<T> = { exact: string; result: T } | { prefix: string; result: T };

/** The origin of a source other than a connected TMS's agent run, after the media sources. */
export const ORIGIN_RULES: SourceRule<AiOrigin>[] = [
  ...Object.entries(ORIGIN_BY_SOURCE).map(([exact, result]) => ({ exact, result })),
  // Workspace automations and their agents: `workspace_orchestrator`, `workspace_*_agent`.
  { prefix: "workspace_", result: "running_automations" },
];

/** How a call reached us; a source no rule names came through the app or the API. */
export const CHANNEL_RULES: SourceRule<AiChannel>[] = [
  { prefix: "slack_", result: "slack" },
  { prefix: "email_", result: "email" },
  { prefix: "contentful_", result: "contentful" },
  { exact: "web_chat_agent_turn", result: "web_chat" },
  { exact: "agent_run_create", result: "connected_tms" },
  { prefix: "github_", result: "github" },
  { exact: "repository_agent_workflow", result: "github" },
  { prefix: "workspace_github_", result: "github" },
  { prefix: "workspace_gitlab_", result: "gitlab" },
  { prefix: "workspace_", result: "automation" },
  { exact: "visual_workflow_ai_step", result: "automation" },
];

function ruleFor<T>(rules: SourceRule<T>[], source: string): T | undefined {
  return rules.find((rule) =>
    "exact" in rule ? rule.exact === source : source.startsWith(rule.prefix),
  )?.result;
}

/**
 * The origin of a billing row. `source` is the row's parent's source when it has a parent, else
 * its own; `agentRunKind` is set for agent runs on tasks from a connected TMS.
 */
export function aiOrigin(source: string, agentRunKind?: string | null): AiOrigin {
  if (MEDIA_SOURCES.has(source)) return "images_and_video";
  if (source === "agent_run_create") return ORIGIN_BY_AGENT_RUN_KIND[agentRunKind ?? ""] ?? "other";
  return ruleFor(ORIGIN_RULES, source) ?? "other";
}

/** How a call reached us: the app unless its source or task says otherwise. */
export function aiChannel(source: string, viaApiKey: boolean): AiChannel {
  return ruleFor(CHANNEL_RULES, source) ?? (viaApiKey ? "api" : "app");
}
