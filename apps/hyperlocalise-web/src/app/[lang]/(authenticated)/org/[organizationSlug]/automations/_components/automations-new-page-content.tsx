"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import {
  createDefaultWorkspaceAutomationFormState,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  validateWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

export function AutomationsNewPageContent({
  organizationSlug,
  initialForm = createDefaultWorkspaceAutomationFormState(),
}: {
  organizationSlug: string;
  initialForm?: WorkspaceAutomationFormState;
}) {
  const router = useRouter();
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
    <WorkspacePageShell className="max-w-5xl">
      <WorkspaceAutomationEditor
        mode="create"
        organizationSlug={organizationSlug}
        form={form}
        errors={errors}
        onChange={setForm}
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/org/${organizationSlug}/automations`} />}
            >
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create automation"}
            </Button>
          </>
        }
      />
    </WorkspacePageShell>
  );
}
