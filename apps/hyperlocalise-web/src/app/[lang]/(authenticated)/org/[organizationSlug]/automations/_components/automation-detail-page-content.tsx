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
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import {
  createWorkspaceAutomationFormStateFromRecord,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  validateWorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { automationDetailPageContentMessages } from "./automation-detail-page-content.messages";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

export function AutomationDetailPageContent({
  organizationSlug,
  automationId,
  knowledgeAvailable = false,
  canUpdateKnowledgeMemory = false,
}: {
  organizationSlug: string;
  automationId: string;
  knowledgeAvailable?: boolean;
  canUpdateKnowledgeMemory?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();

  const automationQuery = useQuery({
    queryKey: ["workspace-automation", organizationSlug, automationId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].$get({
        param: { organizationSlug, automationId },
      });
      if (!response.ok) {
        throw new Error("Failed to load automation");
      }
      return response.json();
    },
  });

  const automation = automationQuery.data?.automation;
  const recentRuns = automationQuery.data?.recentRuns ?? [];
  const [form, setForm] = useState<ReturnType<
    typeof createWorkspaceAutomationFormStateFromRecord
  > | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (automation) {
      setForm(createWorkspaceAutomationFormStateFromRecord(automation));
    }
  }, [automation]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error("missing_form");
      }

      const fieldErrors = validateWorkspaceAutomationFormState(form);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        throw new Error("validation_failed");
      }

      const payload = formStateToWorkspaceAutomationPayload(form);
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].$patch({
        param: { organizationSlug, automationId },
        json: payload,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (body?.error) {
          setErrors(mapWorkspaceAutomationApiErrorToFieldErrors(body.error));
        }
        throw new Error("Failed to update automation");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(automationDetailPageContentMessages.updateSuccess));
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, automationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automations", organizationSlug],
      });
    },
    onError: (error) => {
      if (error.message === "validation_failed") {
        return;
      }
      toast.error(intl.formatMessage(automationDetailPageContentMessages.updateError));
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].runs.$post({
        param: { organizationSlug, automationId },
        json: {
          idempotencyKey: `manual:${automationId}:${Date.now()}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to queue automation run");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(automationDetailPageContentMessages.runQueued));
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, automationId],
      });
    },
    onError: () => {
      toast.error(intl.formatMessage(automationDetailPageContentMessages.runError));
    },
  });

  if (automationQuery.isLoading || !form || !automation) {
    return (
      <WorkspacePageShell>
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...automationDetailPageContentMessages.loading} />
        </p>
      </WorkspacePageShell>
    );
  }

  return (
    <WorkspacePageShell className="max-w-5xl">
      <WorkspaceAutomationEditor
        mode="detail"
        organizationSlug={organizationSlug}
        form={form}
        errors={errors}
        knowledgeAvailable={knowledgeAvailable}
        canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
        onChange={setForm}
        runHistory={recentRuns}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || automation.status !== "active"}
            >
              <FormattedMessage {...automationDetailPageContentMessages.runNow} />
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <FormattedMessage {...automationDetailPageContentMessages.saving} />
              ) : (
                <FormattedMessage {...automationDetailPageContentMessages.saveChanges} />
              )}
            </Button>
          </div>
        }
      />

      <div className="pt-4">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/org/${organizationSlug}/automations`} />}
        >
          <FormattedMessage {...automationDetailPageContentMessages.backToAutomations} />
        </Button>
      </div>
    </WorkspacePageShell>
  );
}
