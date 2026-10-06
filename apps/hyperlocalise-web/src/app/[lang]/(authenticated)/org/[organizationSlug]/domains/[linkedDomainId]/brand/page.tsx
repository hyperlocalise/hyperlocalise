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
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";
import { requireAppCapability } from "@/lib/workos/app-auth";

import { DomainBrandView } from "../../_components/domain-brand-view";
import { DomainResearchShell } from "../../_components/domain-research-shell";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "domainBrand");
}

export default async function DomainBrandPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; linkedDomainId: string }>;
}) {
  const { organizationSlug, linkedDomainId } = await params;
  const auth = await requireAppCapability("projects:read", { organizationSlug });

  return (
    <DomainResearchShell
      organizationSlug={organizationSlug}
      linkedDomainId={linkedDomainId}
      surface="brand"
      canEditLocales={hasCapability(auth.membership.role, "projects:create")}
    >
      <DomainBrandView linkedDomainId={linkedDomainId} />
    </DomainResearchShell>
  );
}
