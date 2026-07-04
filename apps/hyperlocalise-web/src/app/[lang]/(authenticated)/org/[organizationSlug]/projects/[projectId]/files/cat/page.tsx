import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { ProjectFileCatPageContent } from "../_components/project-file-cat-page-content";

export default async function ProjectFileCatPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
  searchParams: Promise<{
    sourcePath?: string;
    locale?: string;
    segment?: string;
  }>;
}) {
  const { organizationSlug, projectId } = await params;
  const { sourcePath, locale, segment } = await searchParams;
  await requireAppAuthContext({ organizationSlug });

  return (
    <ProjectFileCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      sourcePath={sourcePath ?? null}
      highlightLocale={locale ?? null}
      initialSegmentKey={segment ?? null}
    />
  );
}
