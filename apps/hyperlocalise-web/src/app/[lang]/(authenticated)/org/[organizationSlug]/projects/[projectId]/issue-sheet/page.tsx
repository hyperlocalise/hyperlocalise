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
import { TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssueSheetPageContent } from "./_components/issue-sheet-page-content";

export default async function IssueSheetPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const intl = getIntlShape(await getAppLocale());
  const canEditIssues = hasCapability(auth.membership.role, "write_back:translation");

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">
          {intl.formatMessage({
            defaultMessage: "Loading board...",
            id: "LGF0oZcJpk",
            description: "Suspense fallback while Board content loads",
          })}
        </TypographyP>
      }
    >
      <IssueSheetPageContent
        organizationSlug={organizationSlug}
        projectId={projectId}
        canEditIssues={canEditIssues}
      />
    </Suspense>
  );
}
