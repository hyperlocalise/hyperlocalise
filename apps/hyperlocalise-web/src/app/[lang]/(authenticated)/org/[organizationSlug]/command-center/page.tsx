import { redirect } from "next/navigation";

export default async function CommandCenterPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  redirect(`/org/${organizationSlug}/dashboard`);
}
