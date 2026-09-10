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
import { GlossaryHistoryPageContent } from "../_components/glossary-history-page-content";
import { OrgPageSuspense } from "../../../_components/org-page-suspense";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

export default function GlossaryHistoryPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; glossaryId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <GlossaryHistoryPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function GlossaryHistoryPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; glossaryId: string }>;
}) {
  const { organizationSlug, glossaryId } = await params;
  await requireAppAuthContext({ organizationSlug });
  return <GlossaryHistoryPageContent organizationSlug={organizationSlug} glossaryId={glossaryId} />;
}
