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
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { buildProjectPath } from "@/components/app-shell/navigation-config";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { qaWorkspaceMessages as messages } from "../qa-workspace.messages";

type WorkspaceQaRow = {
  projectId: string;
  projectName: string;
  cadence: "off" | "daily";
  lastRunAt: string | null;
  report: {
    status: "queued" | "running" | "succeeded" | "failed";
    findingCount: number;
    errorCount: number;
    warningCount: number;
    completedAt: string | null;
  } | null;
};

export function QaWorkspacePageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const query = useQuery({
    queryKey: ["workspace-qa-reports", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["qa-reports"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadError));
      }
      return (await response.json()) as { reports: WorkspaceQaRow[] };
    },
  });

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={CheckmarkCircle02Icon}
        title={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description)}
      />

      {query.isError ? (
        <TypographyP tone="subtle">{intl.formatMessage(messages.loadError)}</TypographyP>
      ) : null}

      {query.data?.reports.length === 0 ? (
        <TypographyP tone="subtle">{intl.formatMessage(messages.empty)}</TypographyP>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(query.data?.reports ?? []).map((row) => (
          <Card key={row.projectId} className="rounded-2xl border-border bg-muted py-0 ring-0">
            <CardHeader className="px-5 pt-5 pb-0">
              <CardTitle className="text-base font-medium">{row.projectName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-5 pt-3 pb-5">
              <TypographyP size="small" tone="subtle">
                {workspaceQaHeadline(intl, row.report)}
              </TypographyP>
              {row.report?.status === "succeeded" ? (
                <TypographyP size="xsmall" tone="subtle">
                  {intl.formatMessage(messages.counts, {
                    errors: row.report.errorCount,
                    warnings: row.report.warningCount,
                  })}
                </TypographyP>
              ) : null}
              {row.lastRunAt ? (
                <TypographyP size="xsmall" tone="subtle">
                  {intl.formatMessage(messages.lastRun, {
                    date: intl.formatDate(row.lastRunAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </TypographyP>
              ) : null}
              <TypographyP size="xsmall" tone="subtle">
                <FormattedMessage
                  {...(row.cadence === "daily" ? messages.daily : messages.manual)}
                />
              </TypographyP>
              <Button
                nativeButton={false}
                render={<Link href={buildProjectPath(organizationSlug, row.projectId, "qa")} />}
                variant="outline"
                size="sm"
                className="w-fit rounded-full"
              >
                <FormattedMessage {...messages.openProject} />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </WorkspacePageShell>
  );
}

function workspaceQaHeadline(intl: ReturnType<typeof useIntl>, report: WorkspaceQaRow["report"]) {
  if (!report) {
    return intl.formatMessage(messages.neverRun);
  }
  if (report.status === "failed") {
    return intl.formatMessage(messages.failed);
  }
  if (report.status === "running" || report.status === "queued") {
    return intl.formatMessage(messages.running);
  }
  return intl.formatMessage(messages.findings, { count: report.findingCount });
}
