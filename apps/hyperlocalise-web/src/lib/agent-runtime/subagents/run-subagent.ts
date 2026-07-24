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
import type { SubagentCallOptions, HyperlocaliseSubagentType } from "./types";

type SubagentGenerate = {
  generate(input: { prompt: string; options: SubagentCallOptions }): Promise<{ text: string }>;
};

const loadSubagent: Record<HyperlocaliseSubagentType, () => Promise<SubagentGenerate>> = {
  translation: async () => (await import("./translation")).translationSubagent as SubagentGenerate,
  repository: async () => (await import("./repository")).repositorySubagent as SubagentGenerate,
};

export async function runSubagent(
  subagentType: HyperlocaliseSubagentType,
  options: SubagentCallOptions,
): Promise<{ text: string }> {
  const subagent = await loadSubagent[subagentType]();
  return subagent.generate({
    prompt: "Complete the task and return a concise summary for the end user.",
    options,
  });
}
