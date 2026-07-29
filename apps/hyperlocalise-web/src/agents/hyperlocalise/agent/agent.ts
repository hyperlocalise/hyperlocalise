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
import { composeInstructions } from "@/agents/_runtime/compose-instructions";

export type HyperlocaliseAgentSurface = "web" | "slack" | "github";

/**
 * Visual-mock and repository inspection turns need room for inspect → scaffold →
 * capture → fix → retry → final text. Reserve the last step for a text-only reply
 * via `prepareConversationSkillStep`.
 */
export const hyperlocaliseAgentStepLimit = 16;
export const hyperlocaliseAgentMaxOutputTokens = 4_000;

export function buildHyperlocaliseDynamicSections(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  additionalInstructions?: string;
}): string[] {
  const dynamicSections: string[] = [];

  if (input.surface === "slack") {
    dynamicSections.push(
      "Keep responses concise and Slack-friendly. Use short Markdown with bullets, bold labels, and a small number of relevant emoji when it improves readability.",
    );
  } else if (input.surface === "github") {
    dynamicSections.push(
      "Keep GitHub replies concise, concrete, and focused on the requested repository action.",
    );
  }

  if (input.projectId) {
    dynamicSections.push(
      "Project context:",
      `- This conversation is attached to project ${input.projectId}.`,
    );
  }

  if (input.additionalInstructions?.trim()) {
    dynamicSections.push("Surface-specific instructions:", input.additionalInstructions.trim());
  }

  return dynamicSections;
}

export function buildHyperlocaliseBaseInstructions(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  additionalInstructions?: string;
}) {
  return composeInstructions({
    agentId: "hyperlocalise",
    dynamicSections: buildHyperlocaliseDynamicSections(input),
  });
}
