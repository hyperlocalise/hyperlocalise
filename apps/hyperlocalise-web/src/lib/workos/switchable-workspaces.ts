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
type WorkspaceMembership = {
  slug?: string | null;
  membership: { workosMembershipId?: string | null };
};

/**
 * The workspaces a person can open, and a session can be issued for: ones with an
 * address that they have joined in WorkOS.
 */
export function switchableWorkspaces<T extends WorkspaceMembership>(
  organizations: readonly T[],
): Array<T & { slug: string }> {
  return organizations.filter(
    (organization): organization is T & { slug: string } =>
      Boolean(organization.slug) && Boolean(organization.membership.workosMembershipId),
  );
}
