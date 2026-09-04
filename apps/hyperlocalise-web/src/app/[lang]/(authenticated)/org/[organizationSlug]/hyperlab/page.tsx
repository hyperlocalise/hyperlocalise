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
import { HyperlabOverview } from "./_components/hyperlab-overview";
import { OrgPageSuspense } from "../_components/org-page-suspense";

export default function HyperlabPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return (
    <OrgPageSuspense>
      <HyperlabPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function HyperlabPageLoader({ params }: { params: Promise<{ organizationSlug: string }> }) {
  const { organizationSlug } = await params;
  return <HyperlabOverview organizationSlug={organizationSlug} />;
}
