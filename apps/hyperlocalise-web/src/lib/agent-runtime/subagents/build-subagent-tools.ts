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
import type { ToolSet } from "ai";

import {
  filterToolSetByNames,
  repositoryWorkspaceToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import type { HyperlocaliseSubagentType } from "./types";

const subagentToolNames = {
  repository: [...repositoryWorkspaceToolNames],
} satisfies Record<HyperlocaliseSubagentType, string[]>;

export function buildSubagentToolSet(
  toolContext: ToolContext,
  subagentType: HyperlocaliseSubagentType,
): ToolSet {
  return filterToolSetByNames(buildTools(toolContext), subagentToolNames[subagentType]);
}
