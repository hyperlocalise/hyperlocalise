import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { parseProjectFileCatSearchParams } from "@/lib/projects/project-file-cat-routing";

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
    externalResourceId?: string;
    resourceType?: string;
  }>;
}) {
  const { organizationSlug, projectId } = await params;
  const parsedSearchParams = parseProjectFileCatSearchParams(await searchParams);
  await requireAppAuthContext({ organizationSlug });

  return (
    <ProjectFileCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      sourcePath={parsedSearchParams.sourcePath}
      highlightLocale={parsedSearchParams.highlightLocale}
      initialSegmentKey={parsedSearchParams.initialSegmentKey}
      externalResourceId={parsedSearchParams.externalResourceId}
      resourceType={parsedSearchParams.resourceType}
    />
  );
}
