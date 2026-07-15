import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { isReleaseCatAllFilesEnabled } from "@/lib/flags/release-flags";
import { CAT_ALL_FILES_SOURCE_PATH } from "@/lib/projects/cat-all-files";
import { parseProjectFileCatSearchParams } from "@/lib/projects/project-file-cat-routing";
import {
  catAllFilesProviderKindFromTarget,
  resolveProjectResourceTarget,
} from "@/api/routes/project/project.shared";

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
  const auth = await requireAppAuthContext({ organizationSlug });
  const target = await resolveProjectResourceTarget(auth, projectId);
  const catAllFilesEnabled = await isReleaseCatAllFilesEnabled(
    catAllFilesProviderKindFromTarget(target),
  );
  const defaultSourcePath = catAllFilesEnabled
    ? CAT_ALL_FILES_SOURCE_PATH
    : rawSearchParams.sourcePath?.trim()
      ? rawSearchParams.sourcePath
      : null;
  const parsedSearchParams = parseProjectFileCatSearchParams({
    ...rawSearchParams,
    sourcePath: rawSearchParams.sourcePath?.trim()
      ? rawSearchParams.sourcePath
      : (defaultSourcePath ?? undefined),
  });

  return (
    <ProjectFileCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      sourcePath={parsedSearchParams.sourcePath}
      allFiles={
        catAllFilesEnabled ? parsedSearchParams.allFiles || !parsedSearchParams.sourcePath : false
      }
      catAllFilesEnabled={catAllFilesEnabled}
      highlightLocale={parsedSearchParams.highlightLocale}
      initialSegmentKey={parsedSearchParams.initialSegmentKey}
      externalResourceId={parsedSearchParams.externalResourceId}
      resourceType={parsedSearchParams.resourceType}
      branch={parsedSearchParams.branch}
      sourcePaths={parsedSearchParams.sourcePaths}
    />
  );
}
