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
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { OrgPageSuspense } from "../../../../_components/org-page-suspense";
import { TmImportAttemptDetail } from "./_components/tm-import-attempt-detail";

export default function TranslationMemoryImportAttemptPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; memoryId: string; attemptId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <TranslationMemoryImportAttemptLoader params={params} />
    </OrgPageSuspense>
  );
}

async function TranslationMemoryImportAttemptLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; memoryId: string; attemptId: string }>;
}) {
  const { organizationSlug, memoryId, attemptId } = await params;
  await requireAppAuthContext({ organizationSlug });

  return (
    <TmImportAttemptDetail
      organizationSlug={organizationSlug}
      memoryId={memoryId}
      attemptId={attemptId}
    />
  );
}
