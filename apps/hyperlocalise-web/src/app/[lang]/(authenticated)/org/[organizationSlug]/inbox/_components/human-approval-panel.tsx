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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

import { humanApprovalPanelMessages as messages } from "./human-approval-panel.messages";

type Decision = "approved" | "rejected" | "changes_requested";

export function HumanApprovalPanel({
  interactionId,
  organizationSlug,
}: {
  interactionId: string;
  organizationSlug: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["workflow-approval", organizationSlug, interactionId] as const;
  const approvalQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "workflow-approvals"
      ].interaction[":interactionId"].$get({
        param: { organizationSlug, interactionId },
      });
      if (!response.ok) throw new Error("approval_load_failed");
      return (await response.json()).approval;
    },
  });
  const decision = useMutation({
    mutationFn: async (value: Decision) => {
      if (!approvalQuery.data) throw new Error("approval_not_loaded");
      const response = await apiClient.api.orgs[":organizationSlug"]["workflow-approvals"][
        ":requestId"
      ].decision.$post({
        param: { organizationSlug, requestId: approvalQuery.data.id },
        json: { decision: value },
      });
      if (!response.ok) throw new Error("approval_decision_failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast.error(messages.decisionFailed.defaultMessage),
  });

  if (approvalQuery.isPending) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <FormattedMessage {...messages.loading} />
      </div>
    );
  }
  if (!approvalQuery.data || approvalQuery.isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        <FormattedMessage {...messages.loadFailed} />
      </div>
    );
  }

  const approval = approvalQuery.data;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-6">
      <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6">{approval.prompt}</p>
      <div className="grid gap-1 text-xs text-muted-foreground">
        {approval.artifactReference ? (
          <span>
            <FormattedMessage
              {...messages.artifact}
              values={{ value: approval.artifactReference }}
            />
          </span>
        ) : null}
        {approval.jobReference ? (
          <span>
            <FormattedMessage {...messages.job} values={{ value: approval.jobReference }} />
          </span>
        ) : null}
        <span>
          <FormattedMessage
            {...messages.deadline}
            values={{ value: new Date(approval.expiresAt).toLocaleString() }}
          />
        </span>
      </div>
      {approval.status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={decision.isPending} onClick={() => decision.mutate("approved")}>
            <FormattedMessage {...messages.approve} />
          </Button>
          <Button
            disabled={decision.isPending}
            variant="destructive"
            onClick={() => decision.mutate("rejected")}
          >
            <FormattedMessage {...messages.reject} />
          </Button>
          <Button
            disabled={decision.isPending}
            variant="outline"
            onClick={() => decision.mutate("changes_requested")}
          >
            <FormattedMessage {...messages.requestChanges} />
          </Button>
        </div>
      ) : (
        <p className="text-sm font-medium">
          <FormattedMessage {...messages.decided} values={{ status: approval.status }} />
        </p>
      )}
    </div>
  );
}
