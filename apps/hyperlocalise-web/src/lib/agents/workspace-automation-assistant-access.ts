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
import { isWorkspaceOperatorRole } from "@/api/auth/policy";

/** Who the assistant is being offered to. */
export type WorkspaceAutomationAssistantIdentity = {
  workosOrganizationId: string;
  workosUserId: string;
};

/**
 * The one switch for the automation setup assistant, read by the setup pages and by the chat
 * route. Automations themselves, and who may manage them, are checked separately by callers.
 */
export function isWorkspaceAutomationAssistantEnabled(
  _identity: WorkspaceAutomationAssistantIdentity,
): Promise<boolean> {
  return Promise.resolve(true);
}

/** Whether a setup page offers the assistant to this person: it is on and they may manage automations. */
export async function canUseWorkspaceAutomationAssistant(auth: {
  membership: { role: string };
  activeOrganization: { workosOrganizationId: string };
  user: { workosUserId: string };
}): Promise<boolean> {
  return (
    isWorkspaceOperatorRole(auth.membership.role) &&
    (await isWorkspaceAutomationAssistantEnabled({
      workosOrganizationId: auth.activeOrganization.workosOrganizationId,
      workosUserId: auth.user.workosUserId,
    }))
  );
}
