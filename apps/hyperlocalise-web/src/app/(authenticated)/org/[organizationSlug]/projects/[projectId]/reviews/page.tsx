import { ProjectSectionPlaceholder } from "../_components/project-section-placeholder";

export default async function ProjectReviewsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <ProjectSectionPlaceholder
      organizationSlug={organizationSlug}
      projectId={projectId}
      title="Reviews"
      description="Human decisions, approvals, and reviewer queues scoped to this project."
    />
  );
}
