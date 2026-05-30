import { ProjectSectionPlaceholder } from "../_components/project-section-placeholder";

export default async function ProjectActivityPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <ProjectSectionPlaceholder
      organizationSlug={organizationSlug}
      projectId={projectId}
      title="Activity"
      description="Project audit trail — syncs, assignments, agent actions, and configuration changes."
    />
  );
}
