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
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { apiClient } from "@/lib/api-client-instance";
import {
  createDefaultWorkspaceAutomationFormState,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  validateWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { automationsNewPageContentMessages } from "./automations-new-page-content.messages";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

export function AutomationsNewPageContent({
  organizationSlug,
  projectId,
  initialForm = createDefaultWorkspaceAutomationFormState(),
  knowledgeAvailable = false,
  canUpdateKnowledgeMemory = false,
}: {
  organizationSlug: string;
  projectId?: string;
  initialForm?: WorkspaceAutomationFormState;
  knowledgeAvailable?: boolean;
  canUpdateKnowledgeMemory?: boolean;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const automationsBasePath = buildAutomationsPath(organizationSlug, { projectId });

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
        throw new Error(
          body?.message ?? intl.formatMessage(automationsNewPageContentMessages.createFailed),
        );
      }

      return response.json();
    },
    onSuccess: (body) => {
      toast.success(intl.formatMessage(automationsNewPageContentMessages.createSuccess));
      router.push(`${automationsBasePath}/${body.automation.id}`);
    },
    onError: (error) => {
      if (error.message === "validation_failed") {
        return;
      }
      toast.error(intl.formatMessage(automationsNewPageContentMessages.createError));
    },
  });

  return (
    <WorkspacePageShell className="max-w-5xl">
      <WorkspaceAutomationEditor
        mode="create"
        organizationSlug={organizationSlug}
        form={form}
        errors={errors}
        knowledgeAvailable={knowledgeAvailable}
        canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
        onChange={setForm}
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<OrgNavLink href={automationsBasePath} />}
            >
              <FormattedMessage {...automationsNewPageContentMessages.cancel} />
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <FormattedMessage {...automationsNewPageContentMessages.creating} />
              ) : (
                <FormattedMessage {...automationsNewPageContentMessages.createAutomation} />
              )}
            </Button>
          </>
        }
      />
    </WorkspacePageShell>
  );
}
