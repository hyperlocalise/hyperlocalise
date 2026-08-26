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
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { parseLiveProviderGlossaryId } from "@/lib/providers/jobs/tms-provider-resource-id";

export function resolveGlossaryDetailId(input: {
  glossaryId: string;
  providerKind?: ExternalTmsProviderKind | null;
  externalResourceId?: string | null;
}): string {
  const liveId = parseLiveProviderGlossaryId(input.glossaryId);
  if (liveId?.providerKind === "crowdin") {
    return input.glossaryId;
  }

  if (input.providerKind === "crowdin") {
    const externalGlossaryId = input.externalResourceId ?? input.glossaryId;
    return `crowdin:glossary:${externalGlossaryId}`;
  }

  return input.glossaryId;
}

export function buildCrowdinGlossaryConcordanceUrl(input: {
  organizationSlug: string;
  glossaryId: string;
  externalResourceId?: string | null;
}): string {
  const detailId = resolveGlossaryDetailId({
    glossaryId: input.glossaryId,
    providerKind: "crowdin",
    externalResourceId: input.externalResourceId,
  });
  return `/org/${input.organizationSlug}/glossaries/${detailId}`;
}
