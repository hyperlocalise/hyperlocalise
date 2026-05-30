import { ProjectSectionPlaceholder } from "../_components/project-section-placeholder";

export default async function ProjectLocalesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <ProjectSectionPlaceholder
      organizationSlug={organizationSlug}
      projectId={projectId}
      title="Locales"
      description="Track language and market readiness for this project — coverage, blockers, and launch status by locale."
    />
  );
}
