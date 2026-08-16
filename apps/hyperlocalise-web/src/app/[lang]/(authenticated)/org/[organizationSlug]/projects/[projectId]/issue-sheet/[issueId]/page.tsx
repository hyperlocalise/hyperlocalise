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

import { TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssueDetailPageContent } from "./_components/issue-detail-page-content";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; issueId: string }>;
}) {
  const { organizationSlug, projectId: rawProjectId, issueId } = await params;
  const projectId = normalizeProjectId(rawProjectId);
  await requireAppAuthContext({ organizationSlug });
  const intl = getIntlShape(await getAppLocale());

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">
          {intl.formatMessage({
            defaultMessage: "Loading issue...",
            id: "JxSxJmFns3",
            description: "Suspense fallback while the issue detail page loads",
          })}
        </TypographyP>
      }
    >
      <IssueDetailPageContent
        organizationSlug={organizationSlug}
        projectId={projectId}
        issueId={issueId}
      />
    </Suspense>
  );
}
