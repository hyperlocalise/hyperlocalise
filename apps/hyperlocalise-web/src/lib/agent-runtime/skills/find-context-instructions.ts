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
import { loadAgentSkill } from "@/agents/_runtime/loader";

type BuildFindContextSkillInstructionsInput = {
  sourceText?: string | null;
  stringKey?: string | null;
  sourcePath?: string | null;
  contextNote?: string | null;
};

function formatInstructionField(label: string, value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

export function buildFindContextSkillInstructions(input: BuildFindContextSkillInstructionsInput) {
  const repoToolsSkill = loadAgentSkill({ agentId: "hyperlocalise", skillId: "repo-tools" });
  const findContextSkill = loadAgentSkill({ agentId: "hyperlocalise", skillId: "find-context" });
  const requestFields = [
    formatInstructionField("Source file path in the TMS project", input.sourcePath),
    formatInstructionField("String key", input.stringKey),
    formatInstructionField("Source text", input.sourceText),
    formatInstructionField("TMS/context note", input.contextNote),
  ].filter((line): line is string => line !== null);

  const request =
    requestFields.length > 0 ? ["Find context request:", ...requestFields].join("\n") : null;

  return [repoToolsSkill, findContextSkill, request]
    .filter((section): section is string => section !== null && section.trim().length > 0)
    .join("\n\n");
}
