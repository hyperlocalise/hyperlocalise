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
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { TmImportAttemptDetail } from "./_components/tm-import-attempt-detail";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "translationMemoryImport");
}

export default function TranslationMemoryImportAttemptPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; memoryId: string; attemptId: string }>;
}) {
  return <TranslationMemoryImportAttemptLoader params={params} />;
}

async function TranslationMemoryImportAttemptLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; memoryId: string; attemptId: string }>;
}) {
  const { organizationSlug, memoryId, attemptId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <TmImportAttemptDetail
      organizationSlug={organizationSlug}
      memoryId={memoryId}
      attemptId={attemptId}
      currentUserId={auth.user.localUserId}
      canWriteMemories={hasCapability(auth.membership.role, "memories:write")}
    />
  );
}
