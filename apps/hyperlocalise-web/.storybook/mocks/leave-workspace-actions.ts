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

// The real module is a server action that reaches the database and WorkOS session.
export async function finishLeavingWorkspaceAction(
  _leftOrganizationSlug: string,
): Promise<{ redirectTo: string }> {
  return { redirectTo: "/dashboard" };
}
