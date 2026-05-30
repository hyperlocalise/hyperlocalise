import { ProjectSectionPlaceholder } from "../_components/project-section-placeholder";

export default async function ProjectContextPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <ProjectSectionPlaceholder
      organizationSlug={organizationSlug}
      projectId={projectId}
      title="Context"
      description="PRs, screenshots, docs, tickets, Slack threads, and product notes attached to this project."
    />
  );
}
