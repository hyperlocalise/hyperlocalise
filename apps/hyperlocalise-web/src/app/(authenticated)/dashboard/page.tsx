import { redirect } from "next/navigation";

import { getDefaultOrganizationDashboardPath } from "@/lib/workos/app-auth";

export default async function DashboardPage() {
  redirect(await getDefaultOrganizationDashboardPath());
}
