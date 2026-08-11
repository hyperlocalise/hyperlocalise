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
import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { GlossaryDetailPageContent } from "./_components/glossary-detail-page-content";

export default async function GlossaryDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; glossaryId: string }>;
}) {
  const { organizationSlug, glossaryId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense fallback={null}>
      <GlossaryDetailPageContent
        organizationSlug={organizationSlug}
        glossaryId={glossaryId}
        canManageGlossaries={hasCapability(auth.membership.role, "glossaries:write")}
      />
    </Suspense>
  );
}
