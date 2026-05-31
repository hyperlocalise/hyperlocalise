import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { RepositoryAutomationSettingsPanel } from "../../../../_components/repository-automation-settings-panel";
import { hasCapability } from "@/api/auth/policy";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { db, schema } from "@/lib/database";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

export default async function GithubRepositoryAutomationPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; githubRepositoryId: string }>;
}) {
  const { organizationSlug, githubRepositoryId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

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
          render={<Link href={integrationsHref} />}
        >
          Back to integrations
        </Button>
        <TypographyH1>Repository automation</TypographyH1>
        <TypographyP className="text-muted-foreground">
          Configure translation automation for{" "}
          <span className="text-foreground">{repo.fullName}</span>. This is separate from refreshing
          repository metadata from GitHub.
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
