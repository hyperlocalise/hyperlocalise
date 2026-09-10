"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 */
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import type { GlossaryResponse } from "@/api/routes/glossary/glossary.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { getLocaleLabel } from "@/lib/i18n/locales";

import { glossaryDetailPageContentMessages as messages } from "./glossary-detail-page-content.messages";

export function useGlossary({
  organizationSlug,
  glossaryId,
  canManageGlossaries,
}: {
  organizationSlug: string;
  glossaryId: string;
  canManageGlossaries: boolean;
}) {
  const intl = useIntl();
  const glossaryQuery = useQuery({
    queryKey: ["glossary", organizationSlug, glossaryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[":glossaryId"].$get(
        {
          param: { organizationSlug, glossaryId },
        },
      );
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadGlossaryFailed)),
        );
      return (await response.json()) as GlossaryResponse;
    },
  });
  const glossary = glossaryQuery.data?.glossary;
  const canManage =
    canManageGlossaries &&
    (glossary?.source === "native" ||
      (glossary?.source === "external_tms" && glossary.externalProviderKind === "crowdin"));
  const canContribute =
    Boolean(glossary) &&
    (glossary?.source === "native" ||
      (glossary?.source === "external_tms" && glossary.externalProviderKind === "crowdin")) &&
    (canManage || (glossaryQuery.data?.canContribute ?? false));
  const isNative = glossary?.source === "native";
  const isLiveCrowdin =
    glossary?.source === "external_tms" && glossary.externalProviderKind === "crowdin";
  const isConceptGlossary = Boolean(isNative || isLiveCrowdin);
  const sourceLanguage = glossary?.languages.find((language) => language.isSource) ?? {
    locale: glossary?.sourceLocale ?? "",
    name: getLocaleLabel(glossary?.sourceLocale ?? ""),
    isSource: true,
  };
  return {
    glossaryQuery,
    glossary,
    canManage,
    canContribute,
    isNative,
    isLiveCrowdin,
    isConceptGlossary,
    sourceLanguage,
  };
}
