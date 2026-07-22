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
import { composeInstructions } from "@/agents/_runtime/compose-instructions";

import type { ConversationSkillPlan } from "./conversation-skill-registry";

import type { HyperlocaliseAgentSurface } from "@/agents/hyperlocalise/agent/agent";
import { buildHyperlocaliseDynamicSections } from "@/agents/hyperlocalise/agent/agent";

export function buildConversationSkillInstructions(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  skillPlan: ConversationSkillPlan;
  additionalInstructions?: string;
}) {
  return composeInstructions({
    agentId: "hyperlocalise",
    skills: input.skillPlan.instructionSkillIds,
    sharedSkills: input.skillPlan.sharedSkillIds,
    dynamicSections: buildHyperlocaliseDynamicSections(input),
  });
}
