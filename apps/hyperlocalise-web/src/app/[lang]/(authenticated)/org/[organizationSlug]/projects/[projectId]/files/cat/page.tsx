import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { isReleaseCatAllFilesEnabled } from "@/lib/flags/release-flags";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
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
    branch?: string;
    sourcePaths?: string;
  }>;
}) {
  const { organizationSlug, projectId } = await params;
  const parsedSearchParams = parseProjectFileCatSearchParams(await searchParams);
  await requireAppAuthContext({ organizationSlug });
  const providerKind = parseProviderProjectId(projectId)?.providerKind ?? null;
  const catAllFilesEnabled = await isReleaseCatAllFilesEnabled(providerKind);

  return (
    <ProjectFileCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      sourcePath={parsedSearchParams.sourcePath}
      allFiles={catAllFilesEnabled ? parsedSearchParams.allFiles : false}
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
