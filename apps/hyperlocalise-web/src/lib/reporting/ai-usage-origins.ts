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
 * (`usage_events.source`); a token row's own source is generic, so the call is placed by its
 * parent row's source, found through `dimensions.parent_operation_key`. See the research note
 * "AI usage in Reports: origins" for how each source was traced.
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

/** Sources of billing rows that each stand for one image or one video made. */
export const AI_IMAGE_SOURCES = [
  "project_image_variant",
  "project_image_url_translation",
  "image_text_extraction",
  "slack_image_localization",
  "email_image_localization",
  "contentful_image_localization",
] as const;
export const AI_VIDEO_SOURCES = ["project_video_variant", "project_video_url_translation"] as const;

const MEDIA_SOURCES = new Set<string>([...AI_IMAGE_SOURCES, ...AI_VIDEO_SOURCES]);

const ORIGIN_BY_SOURCE: Record<string, AiOrigin> = {
  translation_job_create: "translation",
  translation_job: "translation",
  email_translation_job_create: "translation",
  email_translation_job: "translation",
  contentful_agent: "translation",
  chat_agent_turn: "assistants_and_chat",
  web_chat_agent_turn: "assistants_and_chat",
  slack_agent_turn: "assistants_and_chat",
  email_agent: "assistants_and_chat",
  project_file_string_context_lookup: "assistants_and_chat",
  automation_assistant_turn: "building_automations",
  repository_agent_workflow: "running_automations",
};

/** Kinds of agent runs on tasks from a connected TMS (`agent_runs.kind`). */
const ORIGIN_BY_AGENT_RUN_KIND: Record<string, AiOrigin> = {
  translate: "translation",
  review: "review_and_qa",
  qa_fix: "review_and_qa",
  glossary_suggestion: "review_and_qa",
};

/**
 * The origin of a billing row. `source` is the row's parent's source when it has a parent, else
 * its own; `agentRunKind` is set for agent runs on tasks from a connected TMS.
 */
export function aiOrigin(source: string, agentRunKind?: string | null): AiOrigin {
  if (MEDIA_SOURCES.has(source)) return "images_and_video";
  if (source === "agent_run_create") return ORIGIN_BY_AGENT_RUN_KIND[agentRunKind ?? ""] ?? "other";
  if (ORIGIN_BY_SOURCE[source]) return ORIGIN_BY_SOURCE[source];
  // Workspace automations and their agents: `workspace_orchestrator`, `workspace_*_agent`.
  if (source.startsWith("workspace_")) return "running_automations";
  return "other";
}

/** How a call reached us: the app unless its source or task says otherwise. */
export function aiChannel(source: string, viaApiKey: boolean): AiChannel {
  if (source.startsWith("slack_")) return "slack";
  if (source.startsWith("email_")) return "email";
  if (source.startsWith("contentful_")) return "contentful";
  if (source === "web_chat_agent_turn") return "web_chat";
  if (source === "agent_run_create") return "connected_tms";
  if (source.startsWith("workspace_github_")) return "github";
  if (source.startsWith("workspace_gitlab_")) return "gitlab";
  if (source.startsWith("workspace_") || source === "repository_agent_workflow")
    return "automation";
  return viaApiKey ? "api" : "app";
}
