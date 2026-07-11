import { redirect } from "next/navigation";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  redirect(`/org/${organizationSlug}/dashboard?newRequest=1`);
}
