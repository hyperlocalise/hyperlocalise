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
import { DomainRanksView } from "../../_components/domain-ranks-view";
import { DomainResearchShell } from "../../_components/domain-research-shell";

export default async function DomainRanksPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; linkedDomainId: string }>;
}) {
  const { organizationSlug, linkedDomainId } = await params;

  return (
    <DomainResearchShell
      organizationSlug={organizationSlug}
      linkedDomainId={linkedDomainId}
      surface="ranks"
    >
      <DomainRanksView
        linkedDomainId={linkedDomainId}
        organizationSlug={organizationSlug}
      />
    </DomainResearchShell>
  );
}
