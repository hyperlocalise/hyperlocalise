"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

export function AutomationDetailPageContent({
  organizationSlug,
  automationId,
}: {
  organizationSlug: string;
  automationId: string;
}) {
  const queryClient = useQueryClient();
  const automationQueryKey = ["workspace-automation", organizationSlug, automationId] as const;

  const automationQuery = useQuery({
    queryKey: automationQueryKey,
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
    onSuccess: (data) => {
      toast.success("Automation updated");
      queryClient.setQueryData<typeof data>(automationQueryKey, (current) => ({
        automation: data.automation,
        recentRuns: data.recentRuns ?? current?.recentRuns ?? [],
      }));
      void queryClient.invalidateQueries({
        queryKey: automationQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automations", organizationSlug],
      });
    },
    onError: (error) => {
      if (error.message === "validation_failed") {
        return;
      }
      toast.error("Unable to save automation right now");
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
      toast.success("Manual run queued");
      void queryClient.invalidateQueries({
        queryKey: automationQueryKey,
      });
    },
    onError: () => {
      toast.error("Unable to queue a manual run right now");
    },
  });

  if (automationQuery.isLoading || !form || !automation) {
    return (
      <WorkspacePageShell>
        <p className="text-sm text-muted-foreground">Loading automation...</p>
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
        onChange={setForm}
        runHistory={recentRuns}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || automation.status !== "active"}
            >
              Run now
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save changes"}
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
          Back to automations
        </Button>
      </div>
    </WorkspacePageShell>
  );
}
