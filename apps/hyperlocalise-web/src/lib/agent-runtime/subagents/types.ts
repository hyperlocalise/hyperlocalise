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
import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

export const SUBAGENT_TYPES = ["translation", "repository"] as const;

export type HyperlocaliseSubagentType = (typeof SUBAGENT_TYPES)[number];

export type SubagentCallOptions = {
  toolContext: ToolContext;
  task: string;
  instructions: string;
};

export type SubagentRegistryEntry = {
  shortDescription: string;
  isAvailable: (runtime: HyperlocaliseAgentRuntimeContext) => boolean;
  unavailableMessage: (runtime: HyperlocaliseAgentRuntimeContext) => string;
};
