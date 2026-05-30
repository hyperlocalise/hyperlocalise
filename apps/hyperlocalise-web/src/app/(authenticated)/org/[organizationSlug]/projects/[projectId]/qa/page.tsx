import { ProjectSectionPlaceholder } from "../_components/project-section-placeholder";

export default async function ProjectQaPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <ProjectSectionPlaceholder
      organizationSlug={organizationSlug}
      projectId={projectId}
      title="QA"
      description="ICU errors, glossary conflicts, tone risks, layout issues, and missing placeholders for this project."
    />
  );
}
