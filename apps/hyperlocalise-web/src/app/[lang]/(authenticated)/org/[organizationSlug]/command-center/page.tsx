import { redirect } from "next/navigation";

function buildDashboardRedirectPath(
  organizationSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.set(key, value);
      continue;
    }

    for (const entry of value ?? []) {
      query.append(key, entry);
    }
  }

  const queryString = query.toString();
  return queryString
    ? `/org/${organizationSlug}/dashboard?${queryString}`
    : `/org/${organizationSlug}/dashboard`;
}

export default async function CommandCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ organizationSlug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  redirect(buildDashboardRedirectPath(organizationSlug, resolvedSearchParams));
}
