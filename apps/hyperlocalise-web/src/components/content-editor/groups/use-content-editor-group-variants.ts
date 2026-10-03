"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useQuery } from "@tanstack/react-query";

import { useContentEditorGrouping } from "./content-editor-grouping-context";

type GroupedSegment = { occurrenceCount?: number; divergentLocales?: string[] };

/** True when the copies behind a grouped row do not share one translation in `locale`. */
export function isGroupTranslationDivergent(segment: GroupedSegment, locale: string) {
  return (segment.occurrenceCount ?? 0) > 1 && Boolean(segment.divergentLocales?.includes(locale));
}

export function useHasGroupTranslationVariants(segment: GroupedSegment, locale: string) {
  const grouping = useContentEditorGrouping();
  return grouping?.view === "grouped" && isGroupTranslationDivergent(segment, locale);
}

export function catGroupVariantsQueryKeyRoot(organizationSlug: string, projectId: string) {
  return ["cat-group-variants", organizationSlug, projectId] as const;
}

/**
 * Distinct translations among the identical source strings a grouped row stands for.
 * Only fetched for rows the queue reports as divergent in `locale`.
 */
export function useContentEditorGroupVariants(input: {
  segment: GroupedSegment & { id: string };
  locale: string;
}) {
  const grouping = useContentEditorGrouping();
  const enabled = useHasGroupTranslationVariants(input.segment, input.locale);
  return useQuery({
    queryKey: [
      ...catGroupVariantsQueryKeyRoot(grouping?.organizationSlug ?? "", grouping?.projectId ?? ""),
      grouping?.sourcePath ?? "",
      grouping?.sourcePaths ?? null,
      input.locale,
      input.segment.id,
    ],
    queryFn: async ({ signal }) => {
      const body = await grouping!.client.cat.groupVariants(
        grouping!.organizationSlug,
        grouping!.projectId,
        input.segment.id,
        {
          targetLocale: input.locale,
          groupSourcePath: grouping!.sourcePath,
          ...(grouping!.sourcePaths ? { groupSourcePaths: grouping!.sourcePaths } : {}),
        },
        { signal },
      );
      return body.variants;
    },
    enabled,
    staleTime: 30_000,
  });
}
