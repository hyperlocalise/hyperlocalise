import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { CAT_ALL_FILES_SOURCE_PATH } from "@/lib/projects/cat-all-files";
import { parseProjectFileCatSearchParams } from "@/lib/projects/project-file-cat-routing";

import { ProjectFileCatPageContent } from "../files/_components/project-file-cat-page-content";

export default async function ProjectStringsPage({
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
    branch?: string;
    sourcePaths?: string;
  }>;
}) {
  const { organizationSlug, projectId } = await params;
  const rawSearchParams = await searchParams;
  const parsedSearchParams = parseProjectFileCatSearchParams({
    ...rawSearchParams,
    sourcePath: rawSearchParams.sourcePath?.trim()
      ? rawSearchParams.sourcePath
      : CAT_ALL_FILES_SOURCE_PATH,
  });
  await requireAppAuthContext({ organizationSlug });

  return (
    <ProjectFileCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      sourcePath={parsedSearchParams.sourcePath}
      allFiles={parsedSearchParams.allFiles || !parsedSearchParams.sourcePath}
      highlightLocale={parsedSearchParams.highlightLocale}
      initialSegmentKey={parsedSearchParams.initialSegmentKey}
      externalResourceId={parsedSearchParams.externalResourceId}
      resourceType={parsedSearchParams.resourceType}
      branch={parsedSearchParams.branch}
      sourcePaths={parsedSearchParams.sourcePaths}
    />
  );
}
