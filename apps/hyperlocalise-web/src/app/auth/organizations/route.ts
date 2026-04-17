import { switchToOrganization } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { sanitizeReturnTo } from "@/lib/workos/return-to";

export async function POST(request: Request) {
  const formData = await request.formData();
  const organizationId = formData.get("organizationId");
  const rawReturnTo = formData.get("returnTo");
  const returnTo =
    typeof rawReturnTo === "string" ? sanitizeReturnTo(rawReturnTo, "/dashboard") : "/dashboard";

  if (typeof organizationId !== "string" || organizationId.length === 0) {
    redirect(`/auth/organizations?returnTo=${encodeURIComponent(returnTo)}&error=missing`);
  }

  await switchToOrganization(organizationId, {
    returnTo,
  });
}
