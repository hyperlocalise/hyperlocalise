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
import { TranslationMemoryDetailPageContent } from "./_components/translation-memory-detail-page-content";
import { OrgPageSuspense } from "../../_components/org-page-suspense";

export default function TranslationMemoryDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; memoryId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <TranslationMemoryDetailPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function TranslationMemoryDetailPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; memoryId: string }>;
}) {
  const { organizationSlug, memoryId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <TranslationMemoryDetailPageContent
      organizationSlug={organizationSlug}
      memoryId={memoryId}
      canManageMemories={hasCapability(auth.membership.role, "memories:write")}
    />
  );
}
