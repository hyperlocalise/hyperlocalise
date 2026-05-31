import { ProjectLocalesPageContent } from "./_components/project-locales-page-content";

export default async function ProjectLocalesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return <ProjectLocalesPageContent organizationSlug={organizationSlug} projectId={projectId} />;
}
