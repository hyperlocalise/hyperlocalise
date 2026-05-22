import { DashboardPageContent } from "./_components/dashboard-page-content";

export default async function OrganizationDashboardPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <DashboardPageContent organizationSlug={organizationSlug} />;
}
