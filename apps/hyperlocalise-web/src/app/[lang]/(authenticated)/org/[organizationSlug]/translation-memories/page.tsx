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

import { OrgPageSuspense } from "../_components/org-page-suspense";
import { TranslationMemoriesPageContent } from "./_components/translation-memories-page-content";

export default function TranslationMemoriesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return (
    <OrgPageSuspense>
      <TranslationMemoriesPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function TranslationMemoriesPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <TranslationMemoriesPageContent
      organizationSlug={organizationSlug}
      canCreateMemories={hasCapability(auth.membership.role, "memories:write")}
    />
  );
}
