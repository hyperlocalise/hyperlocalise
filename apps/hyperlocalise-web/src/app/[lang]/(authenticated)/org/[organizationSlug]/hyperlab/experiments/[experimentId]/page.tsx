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

import { HyperlabExperimentDetail } from "../../_components/hyperlab-experiment-detail";
import { OrgPageSuspense } from "../../../_components/org-page-suspense";

export default function HyperlabExperimentDetailRoute({
  params,
}: {
  params: Promise<{ organizationSlug: string; experimentId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <HyperlabExperimentDetailRouteLoader params={params} />
    </OrgPageSuspense>
  );
}

async function HyperlabExperimentDetailRouteLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; experimentId: string }>;
}) {
  const { organizationSlug, experimentId } = await params;
  const auth = await requireAppCapability("experiments:read", { organizationSlug });
  return (
    <HyperlabExperimentDetail
      organizationSlug={organizationSlug}
      experimentId={experimentId}
      canWrite={hasCapability(auth.membership.role, "experiments:write")}
    />
  );
}
