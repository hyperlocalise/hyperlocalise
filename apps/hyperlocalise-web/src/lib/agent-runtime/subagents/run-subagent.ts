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
import {
  billingModelFromSteps,
  extractGenerateResultTokenUsage,
  trackAiCallTokenUsage,
} from "@/lib/billing/agent-runtime-usage";

import type { SubagentCallOptions, HyperlocaliseSubagentType } from "./types";
import { repositorySubagent } from "./repository";

type SubagentGenerate = {
  generate(input: { prompt: string; options: SubagentCallOptions }): Promise<{
    text: string;
    usage?: unknown;
    totalUsage?: unknown;
    steps?: ReadonlyArray<{ model?: { provider?: string; modelId?: string } }>;
  }>;
};

const subagents: Record<HyperlocaliseSubagentType, SubagentGenerate> = {
  repository: repositorySubagent as SubagentGenerate,
};

/** `usageSource` names the caller on the AI Credit row. */
export async function runSubagent(
  subagentType: HyperlocaliseSubagentType,
  options: SubagentCallOptions,
  metering: { usageSource: string },
): Promise<{ text: string }> {
  const result = await subagents[subagentType].generate({
    prompt: "Complete the task and return a concise summary for the end user.",
    options,
  });
  const billingModel = billingModelFromSteps(result);
  if (billingModel) {
    await trackAiCallTokenUsage({
      organizationId: options.toolContext.organizationId,
      source: metering.usageSource,
      tokenUsage: extractGenerateResultTokenUsage(result),
      ...billingModel,
    });
  }
  return { text: result.text };
}
