import { InboxPageContent } from "../_components/inbox-page-content";

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; conversationId: string }>;
}) {
  const { organizationSlug } = await params;

  return <InboxPageContent organizationSlug={organizationSlug} />;
}
