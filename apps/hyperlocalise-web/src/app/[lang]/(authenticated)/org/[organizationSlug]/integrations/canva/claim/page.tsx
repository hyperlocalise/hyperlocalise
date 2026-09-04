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
import { requireAppCapability } from "@/lib/workos/app-auth";

import { CanvaClaimPageContent } from "./canva-claim-page-content";
import { OrgPageSuspense } from "../../../_components/org-page-suspense";

export default function CanvaClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ claimId?: string }>;
}) {
  return (
    <OrgPageSuspense>
      <CanvaClaimPageLoader params={params} searchParams={searchParams} />
    </OrgPageSuspense>
  );
}

async function CanvaClaimPageLoader({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ claimId?: string }>;
}) {
  const { organizationSlug } = await params;
  const { claimId } = await searchParams;
  const auth = await requireAppCapability("provider_credentials:write", { organizationSlug });

  return (
    <CanvaClaimPageContent
      organizationSlug={organizationSlug}
      claimId={claimId ?? null}
      userIsAdmin={hasCapability(auth.membership.role, "integrations:write")}
    />
  );
}
