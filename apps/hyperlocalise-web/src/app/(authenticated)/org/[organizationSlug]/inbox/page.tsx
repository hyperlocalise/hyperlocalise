import { InboxPageContent } from "./_components/inbox-page-content";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <InboxPageContent organizationSlug={organizationSlug} />;
}
