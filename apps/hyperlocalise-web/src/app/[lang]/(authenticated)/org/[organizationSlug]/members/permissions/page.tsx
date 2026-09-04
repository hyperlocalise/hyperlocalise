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
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { RolePermissionsPageView } from "../../settings/_components/role-permissions-page-view";
import { OrgPageSuspense } from "../../_components/org-page-suspense";

export default function RolePermissionsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return (
    <OrgPageSuspense>
      <RolePermissionsPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function RolePermissionsPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppAuthContext({ organizationSlug });

  return <RolePermissionsPageView organizationSlug={organizationSlug} />;
}
