"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";

import {
  extractCrowdinLocaleReadinessEntry,
  resolveProviderTaskLanguageId,
} from "../jobs/_components/provider-tms-job-display";

export const providerJobLocaleReadinessQueryKey = (
  organizationSlug: string,
  providerKind: string,
  externalProjectId: string,
  languageId: string,
) =>
  [
    "provider-job-locale-readiness",
    organizationSlug,
    providerKind,
    externalProjectId,
    languageId,
  ] as const;

export async function fetchProviderJobLocaleReadiness(
  organizationSlug: string,
  externalProjectId: string,
  languageId: string,
) {
  const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
    ":externalProjectId"
  ]["locale-readiness"].$get({
    param: { organizationSlug, externalProjectId },
    query: { languageId },
  });

  if (!response.ok) {
    throw new Error(`Failed to load translation progress (${response.status})`);
  }

  const body = (await response.json()) as { localeReadiness: Record<string, unknown> | null };
  return extractCrowdinLocaleReadinessEntry(body.localeReadiness, languageId);
}

export function useProviderJobLocaleReadiness(input: {
  organizationSlug: string;
  externalProjectId: string | null | undefined;
  providerKind: string | null | undefined;
  providerPayload: Record<string, unknown> | null | undefined;
  enabled?: boolean;
}) {
  const supportsLazyReadiness =
    input.providerKind === "crowdin" || input.providerKind === "lokalise";
  const languageId = resolveProviderTaskLanguageId(
    input.providerKind,
    input.providerPayload ?? null,
  );
  const externalProjectId = input.externalProjectId?.trim() ?? "";
  const enabled =
    (input.enabled ?? true) &&
    supportsLazyReadiness &&
    externalProjectId.length > 0 &&
    Boolean(languageId);

  return useQuery({
    queryKey: providerJobLocaleReadinessQueryKey(
      input.organizationSlug,
      input.providerKind ?? "unknown",
      externalProjectId,
      languageId ?? "",
    ),
    enabled,
    queryFn: () =>
      fetchProviderJobLocaleReadiness(input.organizationSlug, externalProjectId, languageId!),
    staleTime: 60_000,
  });
}
