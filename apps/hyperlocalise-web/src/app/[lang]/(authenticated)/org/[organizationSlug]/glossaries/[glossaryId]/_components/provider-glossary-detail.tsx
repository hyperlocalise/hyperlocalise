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
import { FormattedMessage, useIntl } from "react-intl";
import Link from "next/link";
import { ArrowLeft01Icon, BookOpenTextIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { GlossaryConceptRecord } from "@/api/routes/glossary/glossary.schema";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { selectGlossaryPrimaryTerm, type GlossaryTermStatus } from "@/lib/glossary/glossary";

import { glossaryDetailPageContentMessages as messages } from "./glossary-detail-page-content.messages";
import { useGlossary } from "./use-glossary";

function ProviderGlossaryDetailSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6" aria-busy="true">
      <Skeleton className="h-4 w-24 rounded-full" />
      <Skeleton className="h-12 w-96 max-w-full" />
      <Skeleton className="h-4 w-full max-w-2xl" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </main>
  );
}

export function ProviderGlossaryDetail({
  organizationSlug,
  glossaryId,
  canManageGlossaries,
}: {
  organizationSlug: string;
  glossaryId: string;
  canManageGlossaries: boolean;
}) {
  const intl = useIntl();
  const { glossaryQuery, glossary, isLiveCrowdin, sourceLanguage } = useGlossary({
    organizationSlug,
    glossaryId,
    canManageGlossaries,
  });
  const conceptsQuery = useQuery({
    queryKey: ["provider-glossary-concepts", organizationSlug, glossaryId],
    enabled: isLiveCrowdin,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts.$get({ param: { organizationSlug, glossaryId } });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadConceptsFailed)),
        );
      }
      return (await response.json()).concepts as GlossaryConceptRecord[];
    },
  });

  if (glossaryQuery.isLoading || conceptsQuery.isLoading) {
    return <ProviderGlossaryDetailSkeleton />;
  }
  if (!glossary) {
    return (
      <TypographyP className="py-8" size="small" tone="subtle">
        <FormattedMessage {...messages.notFound} />
      </TypographyP>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <Link
        href={`/org/${organizationSlug}/glossaries`}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        <FormattedMessage {...messages.backToList} />
      </Link>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon icon={BookOpenTextIcon} className="size-5 text-muted-foreground" />
          <Badge variant="outline">
            <FormattedMessage {...messages.sourceProvider} />
          </Badge>
          {glossary.languages.map((language) => (
            <Badge key={language.locale} variant="outline">
              {language.name} <span className="ml-1 text-[10px] opacity-70">{language.locale}</span>
            </Badge>
          ))}
        </div>
        <TypographyH1
          className="text-3xl md:text-5xl lg:text-6xl"
          weight="bold"
          wrapStyle="balance"
        >
          {glossary.name}
        </TypographyH1>
        <TypographyP className="max-w-3xl leading-6" size="small" tone="subtle">
          {glossary.description || intl.formatMessage(messages.descriptionFallback)}
        </TypographyP>
      </section>

      {isLiveCrowdin ? (
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div>
            <TypographyP size="small" weight="medium" tone="content">
              <FormattedMessage {...messages.conceptsTitle} />
            </TypographyP>
            <TypographyP size="xsmall" tone="subtle">
              <FormattedMessage {...messages.providerReadOnly} />
            </TypographyP>
          </div>
          {conceptsQuery.isError ? (
            <TypographyP size="small" tone="critical">
              {conceptsQuery.error.message}
            </TypographyP>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{sourceLanguage.name}</th>
                    <th className="px-3 py-2">
                      <FormattedMessage {...messages.definitionLabel} />
                    </th>
                    <th className="px-3 py-2">
                      <FormattedMessage {...messages.subjectLabel} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(conceptsQuery.data ?? []).map((concept) => {
                    const primary = selectGlossaryPrimaryTerm(
                      concept.terms.map((term) => ({
                        id: term.id,
                        locale: term.locale,
                        text: term.term,
                        status: term.status as GlossaryTermStatus,
                      })),
                      glossary.sourceLocale,
                    );
                    return (
                      <tr key={concept.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-3 font-medium">
                          {primary?.text ?? concept.primaryTerm}
                        </td>
                        <td className="max-w-xs truncate px-3 py-3 text-muted-foreground">
                          {concept.definition || "—"}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {concept.subject || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-border p-4">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.providerReadOnly} />
          </TypographyP>
        </section>
      )}
    </main>
  );
}
