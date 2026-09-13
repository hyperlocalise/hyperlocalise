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
import { DictionariesPageContent } from "./_components/dictionaries-page-content";

export default function DictionariesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return (
    <OrgPageSuspense>
      <DictionariesPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function DictionariesPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <DictionariesPageContent
      organizationSlug={organizationSlug}
      canWriteDictionaries={hasCapability(auth.membership.role, "dictionaries:write")}
    />
  );
}
