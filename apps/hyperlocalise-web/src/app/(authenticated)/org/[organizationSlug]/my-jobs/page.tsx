import { JobsPageContent } from "../jobs/_components/jobs-page-content";

export default async function MyJobsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <JobsPageContent organizationSlug={organizationSlug} scope="mine" />;
}
