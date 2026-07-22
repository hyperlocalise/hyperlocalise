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
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { RepositoryAutomationSettingsPanel } from "../../../../_components/repository-automation-settings-panel";
import { hasCapability } from "@/api/auth/policy";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { db, schema } from "@/lib/database";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

export default async function GithubRepositoryAutomationPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; githubRepositoryId: string }>;
}) {
  const { organizationSlug, githubRepositoryId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const intl = getIntlShape(await getAppLocale());

  if (!hasCapability(auth.membership.role, "integrations:write")) {
    notFound();
  }

  const [repo] = await db
    .select({
      fullName: schema.githubInstallationRepositories.fullName,
      enabled: schema.githubInstallationRepositories.enabled,
      archived: schema.githubInstallationRepositories.archived,
    })
    .from(schema.githubInstallationRepositories)
    .where(
      and(
        eq(
          schema.githubInstallationRepositories.organizationId,
          auth.organization.localOrganizationId,
        ),
        eq(schema.githubInstallationRepositories.githubRepositoryId, githubRepositoryId),
      ),
    )
    .limit(1);

  if (!repo) {
    notFound();
  }

  const integrationsHref = `/org/${organizationSlug}/integrations`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          nativeButton={false}
          render={<Link href={integrationsHref} />}
        >
          {intl.formatMessage({
            defaultMessage: "Back to integrations",
            id: "MKqk5CAbrB",
            description: "Link back to the integrations page from repository automation",
          })}
        </Button>
        <TypographyH1>
          {intl.formatMessage({
            defaultMessage: "Repository automation",
            id: "wqDhnuIkS0",
            description: "Page heading for GitHub repository automation settings",
          })}
        </TypographyH1>
        <TypographyP className="text-muted-foreground">
          {intl.formatMessage(
            {
              defaultMessage:
                "Configure translation automation for {repositoryFullName}. This is separate from refreshing repository metadata from GitHub.",
              id: "T2Xmxy54ip",
              description:
                "Page description for GitHub repository automation settings, including the repository full name",
            },
            {
              repositoryFullName: repo.fullName,
            },
          )}
        </TypographyP>
      </div>

      <RepositoryAutomationSettingsPanel
        organizationSlug={organizationSlug}
        githubRepositoryId={githubRepositoryId}
        repositoryFullName={repo.fullName}
        repositoryEnabled={repo.enabled}
        repositoryArchived={repo.archived}
        userCanManage
      />
    </main>
  );
}
