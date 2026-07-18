import { hasCapability } from "@/api/auth/policy";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { requireWorkspaceFeatureFlag, workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { KnowledgeMemoryEditor } from "./_components/knowledge-memory-editor";

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceKnowledgeFlag, auth);
  const intl = getIntlShape(await getAppLocale());

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="space-y-3">
        <TypographyH1 className="font-heading text-4xl font-semibold text-foreground md:text-5xl">
          {intl.formatMessage({
            defaultMessage: "Knowledge",
            id: "CkQ3yx9NoL",
            description: "Page heading for the organization knowledge memory page",
          })}
        </TypographyH1>
        <TypographyP className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {intl.formatMessage({
            defaultMessage:
              "Store organization-wide localization guidance as one flexible markdown memory.",
            id: "nnXWSAtR1P",
            description: "Page description for the organization knowledge memory page",
          })}
        </TypographyP>
      </div>

      <KnowledgeMemoryEditor
        organizationSlug={organizationSlug}
        canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
      />
    </div>
  );
}
