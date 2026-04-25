import { JobsPageContent } from "@/components/app/workspace-resource-pages";

export default async function JobsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <JobsPageContent organizationSlug={organizationSlug} />;
}
