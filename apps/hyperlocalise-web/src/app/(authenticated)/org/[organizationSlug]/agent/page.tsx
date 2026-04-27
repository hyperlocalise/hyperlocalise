import { AgentPageContent } from "@/components/app/agent-page-content";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <AgentPageContent organizationSlug={organizationSlug} />;
}
