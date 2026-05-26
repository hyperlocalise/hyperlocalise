import type { SubagentCallOptions, HyperlocaliseSubagentType } from "./types";
import { repositorySubagent } from "./repository";
import { translationSubagent } from "./translation";

type SubagentGenerate = {
  generate(input: { prompt: string; options: SubagentCallOptions }): Promise<{ text: string }>;
};

const subagents: Record<HyperlocaliseSubagentType, SubagentGenerate> = {
  translation: translationSubagent as SubagentGenerate,
  repository: repositorySubagent as SubagentGenerate,
};

export async function runSubagent(
  subagentType: HyperlocaliseSubagentType,
  options: SubagentCallOptions,
): Promise<{ text: string }> {
  return subagents[subagentType].generate({
    prompt: "Complete the task and return a concise summary for the end user.",
    options,
  });
}
