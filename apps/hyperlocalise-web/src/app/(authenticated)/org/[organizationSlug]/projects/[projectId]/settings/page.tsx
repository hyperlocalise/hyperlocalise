import { ProjectSectionPlaceholder } from "../_components/project-section-placeholder";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <ProjectSectionPlaceholder
      organizationSlug={organizationSlug}
      projectId={projectId}
      title="Settings"
      description="Project-specific configuration — locales, providers, reviewers, automation rules, and notifications."
    />
  );
}
