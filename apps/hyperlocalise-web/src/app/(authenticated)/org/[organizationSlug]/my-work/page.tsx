import { redirect } from "next/navigation";

export default async function MyWorkPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  redirect(`/org/${organizationSlug}/my-jobs`);
}
