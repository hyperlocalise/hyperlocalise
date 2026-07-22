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

export function composeProviderTmsAgentInstructions(input?: {
  skills?: string[];
  userOverride?: string | null;
}) {
  return composeInstructions({
    automationId: "provider-tms",
    sharedSkills: ["string-translation"],
    skills: input?.skills ?? [],
    userOverride: input?.userOverride,
  });
}

export { executeProviderAgentQa } from "@/lib/providers/agent-runs/provider-agent-qa";
export { executeProviderAgentTranslation } from "@/lib/providers/agent-runs/provider-agent-translate";
export { executeProviderAgentWriteback } from "@/lib/providers/agent-runs/provider-agent-writeback";

export { runTmsAgentAutomationForSyncedJob } from "./schedules/reconciliation";
