import { ProjectSectionPlaceholder } from "../_components/project-section-placeholder";

export default async function ProjectAgentRunsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <ProjectSectionPlaceholder
      organizationSlug={organizationSlug}
      projectId={projectId}
      title="Agent Runs"
      description="AI agent actions, decisions, confidence scores, and automation history for this project."
    />
  );
}
