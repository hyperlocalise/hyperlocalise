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
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { OrgPageSuspense } from "../../../../_components/org-page-suspense";
import { GlossaryInterchangeReport } from "../../_components/glossary-interchange-report";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "glossaryDetail");
}

export default function GlossaryInterchangeReportPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; glossaryId: string; runId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <GlossaryInterchangeReportLoader params={params} />
    </OrgPageSuspense>
  );
}

async function GlossaryInterchangeReportLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; glossaryId: string; runId: string }>;
}) {
  const { organizationSlug, glossaryId, runId } = await params;
  await requireAppAuthContext({ organizationSlug });
  return (
    <GlossaryInterchangeReport
      organizationSlug={organizationSlug}
      glossaryId={glossaryId}
      runId={runId}
    />
  );
}
