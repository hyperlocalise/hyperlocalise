"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client-instance";
import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automations";
import {
  createWorkspaceAutomationFormStateFromRecord,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  validateWorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { WorkspaceAutomationForm } from "./workspace-automation-form";

export function AutomationDetailPageContent({
  organizationSlug,
  automationId,
}: {
  organizationSlug: string;
  automationId: string;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"settings" | "history">("settings");

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
      toast.success("Automation updated");
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
        queryKey: ["workspace-automation", organizationSlug, automationId],
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
    <WorkspacePageShell>
      <PageHeader
        icon={SparklesIcon}
        title={automation.name}
        description="Configure deterministic workflows, notifications, and inspect run history."
        statusLabel={automation.status}
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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="history">Run history</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-6">
          <WorkspaceAutomationForm
            organizationSlug={organizationSlug}
            form={form}
            errors={errors}
            onChange={setForm}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <RunHistoryTable runs={recentRuns} />
        </TabsContent>
      </Tabs>

      <div className="pt-4">
        <Button variant="outline" render={<Link href={`/org/${organizationSlug}/automations`} />}>
          Back to automations
        </Button>
      </div>
    </WorkspacePageShell>
  );
}

function RunHistoryTable({ runs }: { runs: WorkspaceAutomationRunRecord[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-foreground/10">
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 border-b border-foreground/10 px-4 py-3 text-xs font-medium text-muted-foreground">
        <span>Status</span>
        <span>Trigger</span>
        <span>Summary</span>
        <span>Completed</span>
      </div>
      {runs.map((run) => (
        <div
          key={run.id}
          className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 border-b border-foreground/10 px-4 py-4 text-sm last:border-b-0"
        >
          <Badge variant="outline">{run.status}</Badge>
          <span>{run.triggerSource}</span>
          <span className="truncate text-muted-foreground">
            {Object.keys(run.outputSummary).length > 0 ? JSON.stringify(run.outputSummary) : "—"}
          </span>
          <span className="text-muted-foreground">
            {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
