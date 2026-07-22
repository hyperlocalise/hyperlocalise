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
import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { IntegrationsPageContent } from "./_components/integrations-page-content";

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { organizationSlug } = await params;
  const { error } = await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <IntegrationsPageContent
      organizationSlug={organizationSlug}
      membershipRole={auth.membership.role}
      canManageProviderIntegrations={hasCapability(auth.membership.role, "integrations:read")}
      errorCode={error}
    />
  );
}
