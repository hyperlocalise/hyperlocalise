"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";
import {
  extractCrowdinLocaleReadinessEntry,
  getCrowdinTaskLanguageId,
} from "../jobs/_components/provider-crowdin-job-display";

export const crowdinJobLocaleReadinessQueryKey = (
  organizationSlug: string,
  externalProjectId: string,
  languageId: string,
) => ["crowdin-job-locale-readiness", organizationSlug, externalProjectId, languageId] as const;

export async function fetchCrowdinJobLocaleReadiness(
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

export function useCrowdinJobLocaleReadiness(input: {
  organizationSlug: string;
  externalProjectId: string | null | undefined;
  providerKind: string | null | undefined;
  providerPayload: Record<string, unknown> | null | undefined;
  enabled?: boolean;
}) {
  const languageId = getCrowdinTaskLanguageId(input.providerPayload ?? null);
  const isCrowdin = input.providerKind === "crowdin";
  const externalProjectId = input.externalProjectId?.trim() ?? "";
  const enabled =
    (input.enabled ?? true) && isCrowdin && externalProjectId.length > 0 && Boolean(languageId);

  return useQuery({
    queryKey: crowdinJobLocaleReadinessQueryKey(
      input.organizationSlug,
      externalProjectId,
      languageId ?? "",
    ),
    enabled,
    queryFn: () =>
      fetchCrowdinJobLocaleReadiness(input.organizationSlug, externalProjectId, languageId!),
    staleTime: 60_000,
  });
}
