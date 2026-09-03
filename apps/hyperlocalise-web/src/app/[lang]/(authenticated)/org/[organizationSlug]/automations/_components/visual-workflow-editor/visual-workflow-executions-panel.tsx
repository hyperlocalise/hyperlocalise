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
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VisualWorkflowRunRecord } from "@/lib/visual-workflows/visual-workflow-run-types";

import type { VisualWorkflowsApi } from "../visual-workflows-api";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

function runStatusVariant(status: VisualWorkflowRunRecord["status"]) {
  switch (status) {
    case "succeeded":
      return "default" as const;
    case "failed":
      return "destructive" as const;
    case "running":
    case "queued":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export function VisualWorkflowExecutionsPanel({
  organizationSlug,
  visualWorkflowId,
  visualWorkflowsApi,
  selectedRunId,
  onSelectRun,
}: {
  organizationSlug: string;
  visualWorkflowId: string;
  visualWorkflowsApi: VisualWorkflowsApi;
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
}) {
  const intl = useIntl();
  const runsQuery = useQuery({
    queryKey: ["visual-workflow-runs", organizationSlug, visualWorkflowId],
    queryFn: () => visualWorkflowsApi.listVisualWorkflowRuns(organizationSlug, visualWorkflowId),
    refetchInterval: (query) => {
      const runs = query.state.data ?? [];
      const hasActive = runs.some((run) => run.status === "queued" || run.status === "running");
      return hasActive ? 2000 : false;
    },
  });

  const selectedRunQuery = useQuery({
    queryKey: ["visual-workflow-run", organizationSlug, visualWorkflowId, selectedRunId],
    queryFn: () =>
      visualWorkflowsApi.getVisualWorkflowRun(organizationSlug, visualWorkflowId, selectedRunId!),
    enabled: Boolean(selectedRunId),
    refetchInterval: (query) => {
      const run = query.state.data;
      if (!run) {
        return false;
      }
      return run.status === "queued" || run.status === "running" ? 1500 : false;
    },
  });

  const runs = runsQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">
            <FormattedMessage {...messages.executionsTab} />
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {runsQuery.isLoading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              <FormattedMessage {...messages.executionsLoading} />
            </p>
          ) : runs.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              <FormattedMessage {...messages.executionsEmpty} />
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((run) => (
                <li key={run.id}>
                  <Button
                    type="button"
                    variant={selectedRunId === run.id ? "secondary" : "ghost"}
                    className="h-auto w-full justify-start rounded-none px-4 py-3 text-left"
                    onClick={() => onSelectRun(run.id)}
                  >
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {intl.formatDate(new Date(run.createdAt), {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <Badge variant={runStatusVariant(run.status)} className="rounded-full">
                          {run.status}
                        </Badge>
                      </div>
                      <span className="text-sm">{run.triggerSource}</span>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!selectedRunId ? (
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.executionsSelectRun} />
          </p>
        ) : selectedRunQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.executionsLoading} />
          </p>
        ) : selectedRunQuery.data ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={runStatusVariant(selectedRunQuery.data.status)}>
                {selectedRunQuery.data.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {selectedRunQuery.data.triggerSource}
              </span>
            </div>
            {(selectedRunQuery.data.nodeRuns ?? []).length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">
                        <FormattedMessage {...messages.executionNodeColumn} />
                      </th>
                      <th className="px-3 py-2 font-medium">
                        <FormattedMessage {...messages.executionStatusColumn} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRunQuery.data.nodeRuns ?? []).map((nodeRun) => (
                      <tr key={nodeRun.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{nodeRun.nodeId}</td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={runStatusVariant(nodeRun.status)}
                            className="rounded-full"
                          >
                            {nodeRun.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.executionsNoNodeRuns} />
              </p>
            )}
            {selectedRunQuery.data.error ? (
              <pre className="overflow-x-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {JSON.stringify(selectedRunQuery.data.error, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
