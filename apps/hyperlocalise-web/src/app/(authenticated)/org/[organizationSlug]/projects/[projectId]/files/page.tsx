import { ProjectFilesPageContent } from "./_components/project-files-page-content";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return <ProjectFilesPageContent organizationSlug={organizationSlug} projectId={projectId} />;
}
