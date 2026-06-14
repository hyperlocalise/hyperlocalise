import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { InboxPageContent } from "../_components/inbox-page-content";

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; conversationId: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const currentUserName =
    [auth.sessionUser.firstName, auth.sessionUser.lastName].filter(Boolean).join(" ") ||
    auth.sessionUser.email;

  return (
    <InboxPageContent
      currentUser={{
        avatarUrl: auth.sessionUser.profilePictureUrl ?? null,
        email: auth.sessionUser.email,
        name: currentUserName,
      }}
      organizationSlug={organizationSlug}
    />
  );
}
