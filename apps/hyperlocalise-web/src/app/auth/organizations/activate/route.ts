import { switchToOrganization } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { sanitizeReturnTo } from "@/lib/workos/return-to";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const organizationId = requestUrl.searchParams.get("organizationId");
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo"), "/dashboard");

  if (!organizationId) {
    redirect(`/auth/organizations?returnTo=${encodeURIComponent(returnTo)}&error=missing`);
  }

  await switchToOrganization(organizationId, {
    returnTo,
  });
}
