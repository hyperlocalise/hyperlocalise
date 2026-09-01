/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { redirect } from "next/navigation";

import { requireAppAuthContext } from "@/lib/workos/app-auth";

export default async function ConnectCanvaPage({
  searchParams,
}: {
  searchParams: Promise<{ claimId?: string }>;
}) {
  const { claimId } = await searchParams;
  const auth = await requireAppAuthContext();
  const organizationSlug = auth.organization.slug;

  if (!organizationSlug) {
    redirect("/auth/select-organization");
  }

  if (!claimId) {
    redirect(`/org/${organizationSlug}/integrations`);
  }

  redirect(
    `/org/${organizationSlug}/integrations/canva/claim?claimId=${encodeURIComponent(claimId)}`,
  );
}
