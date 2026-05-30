import { redirect } from "next/navigation";

export default async function NewRequestPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  redirect(`/org/${organizationSlug}/chat`);
}
