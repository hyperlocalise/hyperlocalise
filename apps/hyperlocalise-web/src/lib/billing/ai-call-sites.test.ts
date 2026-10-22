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
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

/**
 * Every file that calls an AI model, and how its calls are billed (or why they are not). A new
 * call site fails this test until it is billed and listed here; a removed one must be unlisted.
 */
const AI_CALL_SITES: Record<string, string> = {
  "agents/automation-assistant/agent/agent.ts": "agent run and tokens, per turn in channels/web.ts",
  "agents/automation-assistant/agent/channels/web.ts": "agent run and tokens",
  "agents/automations/contentful/agent/run-contentful-agent.ts": "agent run and tokens",
  "agents/automations/workspace/agent/channels/web-chat.ts":
    "agent run only; tokens not billed yet (workspace web chat)",
  "agents/automations/workspace/agent/repository-agent.ts": "agent run and tokens",
  "agents/automations/workspace/agent/tools/use_ahrefs.ts": "agent run and tokens, per tool call",
  "agents/automations/workspace/agent/tools/use_crowdin.ts": "agent run and tokens, per tool call",
  "agents/automations/workspace/agent/tools/use_semrush.ts": "agent run and tokens, per tool call",
  "agents/automations/workspace/agent/tools/use_web_search.ts":
    "agent run and tokens, per tool call",
  "agents/automations/workspace/agent/tools/use_zernio.ts": "agent run and tokens, per tool call",
  "agents/hyperlocalise/agent/channels/slack.ts": "agent run and tokens, classifier included",
  "agents/hyperlocalise/agent/channels/web.ts": "agent run and tokens, classifier included",
  "agents/hyperlocalise/agent/subagents/repository/agent.ts":
    "AI credit tokens, in lib/agent-runtime/subagents/run-subagent.ts",
  "lib/agent-runtime/loops/conversation-classifier.ts":
    "tokens reported through onUsage to the caller's turn billing",
  "lib/agent-runtime/loops/conversation-skill-agent.ts":
    "agent run and tokens, per turn in the chat channels",
  "lib/agent-runtime/loops/hyperlocalise-agent.ts":
    "agent run and tokens, per turn in the chat channels",
  "lib/agent-runtime/subagents/run-subagent.ts": "AI credit tokens",
  "lib/agents/email/intent.ts": "not billed yet (email request reading)",
  "lib/agents/github/github-repository-automation-agent.ts": "agent run and tokens",
  "lib/agents/image-generation.ts": "agent run and image tokens",
  "lib/agents/image-text-extraction.ts": "agent run and tokens",
  "lib/agents/slack/image-attachments.ts": "not billed yet (Slack image request reading)",
  "lib/agents/video-generation.ts": "agent run and video units",
  "lib/ai/evaluate.ts": "not billed: no callers",
  "lib/localisation-audit/company-profile.ts": "not billed: public website audit, no workspace",
  "lib/localisation-audit/credits/luna.ts": "not billed: public website audit, no workspace",
  "lib/projects/files/document-variant-service.ts": "AI credit tokens",
  "lib/translation/generation.ts":
    "tokens returned to callers (translation jobs, chat translate_string, Contentful fields, editor suggestions), which bill them",
  "lib/visual-workflows/runtime/execute-node.ts": "AI credit tokens (visual workflow AI step)",
  "workflows/repository-agent.ts": "agent run and tokens",
  "workflows/workspace-automation-execution.ts": "agent run and tokens, completed in later steps",
};

const AI_FUNCTIONS = [
  "generateText",
  "streamText",
  "generateObject",
  "streamObject",
  "embed",
  "embedMany",
  "generateImage",
  "experimental_generateImage",
  "experimental_generateVideo",
  "experimental_generateSpeech",
  "experimental_transcribe",
  "experimental_evaluate",
  "ToolLoopAgent",
  "WorkflowAgent",
  "Experimental_Agent",
];
// Running an agent built in another file: `agent.generate({` / `agent.stream({`.
const AGENT_CALL = /\.(?:generate|stream)\(\{/;
// Value imports from the AI SDK, so a renamed import (`x as y`) is still found.
const AI_SDK_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["'](?:ai|@ai-sdk\/workflow)["']/g;

function callsAiModel(source: string) {
  if (AGENT_CALL.test(source)) {
    return true;
  }
  return [...source.matchAll(AI_SDK_IMPORT)].some(([, names]) =>
    names
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/)[0])
      .some((name) => AI_FUNCTIONS.includes(name)),
  );
}

const SKIPPED_FILE = /\.(?:test|stories|fixture|story-view)\.|-msw-handlers\./;
const SKIPPED_DIRECTORY = new Set(["e2e", "evals"]);

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORY.has(entry.name) ? [] : listSourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !SKIPPED_FILE.test(entry.name) ? [path] : [];
  });
}

describe("AI call sites", () => {
  it("lists every file that calls an AI model with how it is billed", () => {
    const found = listSourceFiles(sourceRoot)
      .filter((path) => callsAiModel(readFileSync(path, "utf8")))
      .map((path) => relative(sourceRoot, path))
      .sort();

    const unlisted = found.filter((path) => !(path in AI_CALL_SITES));
    const stale = Object.keys(AI_CALL_SITES).filter((path) => !found.includes(path));

    expect(
      unlisted,
      "New AI call site: bill its calls (see src/lib/billing/agent-runtime-usage.ts) and add it to AI_CALL_SITES with how it is billed",
    ).toEqual([]);
    expect(stale, "No AI call left in these files: remove them from AI_CALL_SITES").toEqual([]);
  });
});
