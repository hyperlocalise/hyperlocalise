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

import { HyperlabAudienceDetail } from "../../_components/hyperlab-audience-detail";

export default async function HyperlabAudienceDetailRoute({
  params,
}: {
  params: Promise<{ organizationSlug: string; audienceId: string }>;
}) {
  const { organizationSlug, audienceId } = await params;
  const auth = await requireAppCapability("experiments:read", { organizationSlug });
  return (
    <HyperlabAudienceDetail
      organizationSlug={organizationSlug}
      audienceId={audienceId}
      canWrite={hasCapability(auth.membership.role, "experiments:write")}
    />
  );
}
