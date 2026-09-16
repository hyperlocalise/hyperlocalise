"use client";

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
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { QA_FINDING_PROMOTE_BATCH_SIZE } from "@/lib/qa/qa-finding-issue-bridge";

import { qaFindingsTableMessages as messages } from "./qa-findings-table.messages";

type PromoteFindingsResponse = {
  results: Array<{ findingId: string; issueId: string; identifier: string; created: boolean }>;
};

export type QaFindingRow = {
  id: string;
  runId: string;
  projectId: string;
  projectName?: string;
  key: string;
  targetLocale: string;
  checkType: string;
  severity: "error" | "warning";
  message: string;
  sourceText: string;
  targetText: string;
  editorHref: string;
};

type QaFindingsTableProps = {
  organizationSlug: string;
  findings: QaFindingRow[];
  total: number;
  shownCount: number;
  canPromote: boolean;
  promoteScope: "workspace" | "project";
  projectId?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onPromoted?: () => void;
};

export function QaFindingsTable({
  organizationSlug,
  findings,
  total,
  shownCount,
  canPromote,
  promoteScope,
  projectId,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onPromoted,
}: QaFindingsTableProps) {
  const intl = useIntl();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const allSelected = findings.length > 0 && findings.every((row) => selectedIds.has(row.id));

  const promoteMutation = useMutation({
    mutationFn: async (findingIds: string[]) => {
      const results: PromoteFindingsResponse["results"] = [];
      for (let offset = 0; offset < findingIds.length; offset += QA_FINDING_PROMOTE_BATCH_SIZE) {
        const chunk = findingIds.slice(offset, offset + QA_FINDING_PROMOTE_BATCH_SIZE);
        let response;
        if (promoteScope === "project" && projectId) {
          response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
            "qa-reports"
          ]["findings"].promote.$post({
            param: { organizationSlug, projectId },
            json: { findingIds: chunk },
          });
        } else {
          response = await apiClient.api.orgs[":organizationSlug"][
            "qa-reports"
          ].findings.promote.$post({
            param: { organizationSlug },
            json: { findingIds: chunk },
          });
        }
        if (!response.ok) {
          throw await readApiResponseError(response, intl.formatMessage(messages.promoteError));
        }
        const body = (await response.json()) as PromoteFindingsResponse;
        results.push(...body.results);
      }
      return { results };
    },
    onSuccess: (data: PromoteFindingsResponse) => {
      const created = data.results.filter((row) => row.created).length;
      const linked = data.results.length - created;
      toast.success(intl.formatMessage(messages.promoteSuccess, { created, linked }));
      setSelectedIds(new Set());
      onPromoted?.();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.promoteError),
      );
    },
  });

  const selectedCount = useMemo(
    () => findings.filter((row) => selectedIds.has(row.id)).length,
    [findings, selectedIds],
  );

  return (
    <div className="flex flex-col gap-3">
      {canPromote ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={selectedCount === 0 || promoteMutation.isPending}
            onClick={() => {
              const findingIds = findings
                .filter((row) => selectedIds.has(row.id))
                .map((row) => row.id);
              promoteMutation.mutate(findingIds);
            }}
          >
            <FormattedMessage
              {...messages.createIssues}
              values={{ count: selectedCount > 0 ? selectedCount : undefined }}
            />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={findings.length === 0 || promoteMutation.isPending}
            onClick={() => {
              promoteMutation.mutate(findings.map((row) => row.id));
            }}
          >
            <FormattedMessage {...messages.createIssuesPage} />
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {canPromote ? (
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIds(new Set(findings.map((row) => row.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    aria-label={intl.formatMessage(messages.selectAll)}
                  />
                </th>
              ) : null}
              {findings.some((row) => row.projectName) ? (
                <th className="px-3 py-2 font-medium">
                  <FormattedMessage {...messages.project} />
                </th>
              ) : null}
              <th className="px-3 py-2 font-medium">
                <FormattedMessage {...messages.key} />
              </th>
              <th className="px-3 py-2 font-medium">
                <FormattedMessage {...messages.locale} />
              </th>
              <th className="px-3 py-2 font-medium">
                <FormattedMessage {...messages.check} />
              </th>
              <th className="px-3 py-2 font-medium">
                <FormattedMessage {...messages.source} />
              </th>
              <th className="px-3 py-2 font-medium">
                <FormattedMessage {...messages.target} />
              </th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr key={finding.id} className="border-t border-border">
                {canPromote ? (
                  <td className="px-3 py-2 align-top">
                    <Checkbox
                      checked={selectedIds.has(finding.id)}
                      onCheckedChange={(checked) => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (checked) {
                            next.add(finding.id);
                          } else {
                            next.delete(finding.id);
                          }
                          return next;
                        });
                      }}
                      aria-label={finding.key}
                    />
                  </td>
                ) : null}
                {finding.projectName ? (
                  <td className="px-3 py-2 align-top">{finding.projectName}</td>
                ) : null}
                <td className="px-3 py-2 align-top font-medium">{finding.key}</td>
                <td className="px-3 py-2 align-top">{finding.targetLocale}</td>
                <td className="px-3 py-2 align-top">
                  <Badge variant={finding.severity === "error" ? "destructive" : "warning"}>
                    {finding.checkType}
                  </Badge>
                  <TypographyP size="xsmall" tone="subtle">
                    {finding.message}
                  </TypographyP>
                </td>
                <td className="max-w-56 px-3 py-2 align-top break-words">{finding.sourceText}</td>
                <td className="max-w-56 px-3 py-2 align-top break-words">{finding.targetText}</td>
                <td className="px-3 py-2 align-top">
                  <Button
                    nativeButton={false}
                    render={<Link href={finding.editorHref} />}
                    variant="ghost"
                    size="sm"
                  >
                    <FormattedMessage {...messages.openEditor} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <TypographyP size="xsmall" tone="subtle">
          <FormattedMessage {...messages.shown} values={{ shown: shownCount, total }} />
        </TypographyP>
        {hasMore ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            <FormattedMessage {...(isLoadingMore ? messages.loadingMore : messages.loadMore)} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
