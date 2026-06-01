"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import {
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromTemplate,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  validateWorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { WorkspaceAutomationForm } from "./workspace-automation-form";

export function AutomationsNewPageContent({
  organizationSlug,
  templateId,
}: {
  organizationSlug: string;
  templateId?: string;
}) {
  const router = useRouter();
  const initialForm = useMemo(() => {
    if (templateId) {
      return (
        createWorkspaceAutomationFormStateFromTemplate(templateId) ??
        createDefaultWorkspaceAutomationFormState()
      );
    }

    return createDefaultWorkspaceAutomationFormState();
  }, [templateId]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const createMutation = useMutation({
    mutationFn: async () => {
      const fieldErrors = validateWorkspaceAutomationFormState(form);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        throw new Error("validation_failed");
      }

      const payload = formStateToWorkspaceAutomationPayload(form);
      const response = await apiClient.api.orgs[":organizationSlug"].automations.$post({
        param: { organizationSlug },
        json: payload,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        if (body?.error) {
          setErrors(mapWorkspaceAutomationApiErrorToFieldErrors(body.error));
        }
        throw new Error(body?.message ?? "Failed to create automation");
      }

      return response.json();
    },
    onSuccess: (body) => {
      toast.success("Automation created");
      router.push(`/org/${organizationSlug}/automations/${body.automation.id}`);
    },
    onError: (error) => {
      if (error.message === "validation_failed") {
        return;
      }
      toast.error("Unable to create automation right now");
    },
  });

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={SparklesIcon}
        title="New automation"
        description="Configure triggers, deterministic GitHub workflows, and terminal notifications."
      />
      <div className="mb-4">
        <TypographyH1 className="text-2xl">Create automation</TypographyH1>
        <TypographyP className="text-muted-foreground">
          {templateId
            ? "Template defaults are prefilled below. Review repository, project, and notification settings before saving."
            : "Start from scratch or return to the templates gallery."}
        </TypographyP>
      </div>

      <WorkspaceAutomationForm
        organizationSlug={organizationSlug}
        form={form}
        errors={errors}
        onChange={setForm}
      />

      <div className="flex items-center justify-end gap-3 border-t border-foreground/10 pt-6">
        <Button variant="outline" render={<Link href={`/org/${organizationSlug}/automations`} />}>
          Cancel
        </Button>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create automation"}
        </Button>
      </div>
    </WorkspacePageShell>
  );
}
