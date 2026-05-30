import { Suspense } from "react";

import { FilesPageContent } from "./_components/files-page-content";
import { TypographyP } from "@/components/ui/typography";

export default async function FilesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return (
    <Suspense
      fallback={<TypographyP className="text-sm text-foreground/52">Loading files…</TypographyP>}
    >
      <FilesPageContent organizationSlug={organizationSlug} />
    </Suspense>
  );
}
