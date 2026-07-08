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
  const request = [
    "Find context request:",
    formatInstructionField("Source file path in the TMS project", input.sourcePath),
    formatInstructionField("String key", input.stringKey),
    formatInstructionField("Source text", input.sourceText),
    formatInstructionField("TMS/context note", input.contextNote),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return [repoToolsSkill, findContextSkill, request]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}
