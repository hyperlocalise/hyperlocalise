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
import { QaProjectPageContent } from "./_components/qa-project-page-content";

export default function ProjectQaPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <ProjectQaLoader params={params} />
    </OrgPageSuspense>
  );
}

async function ProjectQaLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  await requireAppAuthContext({ organizationSlug });
  return <QaProjectPageContent organizationSlug={organizationSlug} projectId={projectId} />;
}
