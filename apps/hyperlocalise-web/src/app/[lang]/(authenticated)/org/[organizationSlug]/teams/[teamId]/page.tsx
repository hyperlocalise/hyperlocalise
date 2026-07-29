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
import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { TeamDetailPageContent } from "../_components/team-detail-page-content";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; teamId: string }>;
}) {
  const { organizationSlug, teamId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <TeamDetailPageContent
      organizationSlug={organizationSlug}
      teamId={teamId}
      canManageTeams={hasCapability(auth.membership.role, "teams:write")}
      currentUserWorkosId={auth.user.workosUserId}
    />
  );
}
