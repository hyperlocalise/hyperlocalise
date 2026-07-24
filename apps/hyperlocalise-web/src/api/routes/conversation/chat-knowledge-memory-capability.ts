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
import type { AuthVariables } from "@/api/auth/workos";
import { workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";

export async function resolveChatKnowledgeMemoryCapability(auth: AuthVariables["auth"]) {
  try {
    return (
      (await workspaceKnowledgeFlag.run({
        identify: () => ({
          organization: { id: auth.organization.workosOrganizationId },
          user: { id: auth.user.workosUserId },
        }),
      })) === true
    );
  } catch {
    return false;
  }
}
