/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
