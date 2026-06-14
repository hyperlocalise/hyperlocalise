import { ChatPageContent } from "./_components/chat-page-content";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <ChatPageContent organizationSlug={organizationSlug} />;
}
