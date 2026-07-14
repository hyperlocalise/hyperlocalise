import { hasCapability } from "@/api/auth/policy";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="space-y-3">
        <TypographyH1 className="font-heading text-4xl font-semibold text-foreground md:text-5xl">
          Knowledge
        </TypographyH1>
        <TypographyP className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Store organization-wide localization guidance as one flexible markdown memory.
        </TypographyP>
      </div>

      <KnowledgeMemoryEditor
        organizationSlug={organizationSlug}
        canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
      />
    </div>
  );
}
