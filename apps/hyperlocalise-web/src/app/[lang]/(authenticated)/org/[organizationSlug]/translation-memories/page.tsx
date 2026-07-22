/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { TranslationMemoriesPageContent } from "./_components/translation-memories-page-content";

export default async function TranslationMemoriesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense fallback={null}>
      <TranslationMemoriesPageContent
        organizationSlug={organizationSlug}
        canCreateMemories={hasCapability(auth.membership.role, "memories:write")}
      />
    </Suspense>
  );
}
