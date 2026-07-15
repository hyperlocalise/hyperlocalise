import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssuesPageContent } from "./_components/issues-page-content";

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">Loading issues...</TypographyP>
      }
    >
      <IssuesPageContent organizationSlug={organizationSlug} />
    </Suspense>
  );
}
