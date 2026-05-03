import { ProjectsPageContent } from "./_components/projects-page-content";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <ProjectsPageContent organizationSlug={organizationSlug} />;
}
