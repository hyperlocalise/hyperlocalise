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
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
} from "@/components/content-editor/shared/types";
import { apiClient } from "@/lib/api-client-instance";
import {
  formatChecksFromScanFindings,
  type TranslationQaFindingLike,
} from "@/lib/qa/map-finding-to-format-check";
import type { TranslationQaSeverity } from "@/lib/qa/types";

type CatScanFinding = TranslationQaFindingLike;

function findingKey(translationKeyId: string | null | undefined, key: string) {
  return translationKeyId ?? key;
}

export function useCatScanFindings(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  enabled: boolean;
}) {
  const query = useQuery({
    queryKey: [
      "cat-qa-scan-findings",
      input.organizationSlug,
      input.projectId,
      input.targetLocale,
      input.sourcePath,
    ],
    enabled:
      input.enabled && Boolean(input.organizationSlug && input.projectId && input.targetLocale),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "qa-reports"
      ]["latest-findings"].$get({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
        },
        query: {
          locale: input.targetLocale,
          sourcePath: input.sourcePath,
        },
      });
      if (!response.ok) {
        return { runId: null, findings: [] as CatScanFinding[] };
      }
      const body = (await response.json()) as {
        runId: string | null;
        findings: Array<{
          translationKeyId: string | null;
          key: string;
          sourcePath: string | null;
          targetLocale: string;
          checkType: string;
          severity: TranslationQaSeverity;
          category: string;
          message: string;
          relatedTokens: string[];
          targetText: string;
        }>;
      };
      return body;
    },
    staleTime: 30_000,
  });

  const findingsBySegment = useMemo(() => {
    const index = new Map<string, CatScanFinding[]>();
    for (const finding of query.data?.findings ?? []) {
      const id = findingKey(finding.translationKeyId, finding.key);
      const existing = index.get(id) ?? [];
      existing.push(finding);
      index.set(id, existing);
      if (finding.translationKeyId && finding.key !== finding.translationKeyId) {
        const byKey = index.get(finding.key) ?? [];
        byKey.push(finding);
        index.set(finding.key, byKey);
      }
    }
    return index;
  }, [query.data]);

  const runQaChecks = useCallback(
    async (segment: ContentEditorSegment, value: string): Promise<ContentEditorFormatCheck[]> => {
      const findings =
        findingsBySegment.get(segment.id) ?? findingsBySegment.get(segment.key) ?? [];
      return formatChecksFromScanFindings(findings, segment, value);
    },
    [findingsBySegment],
  );

  return {
    runQaChecks: input.enabled ? runQaChecks : undefined,
    isLoading: query.isLoading,
  };
}
