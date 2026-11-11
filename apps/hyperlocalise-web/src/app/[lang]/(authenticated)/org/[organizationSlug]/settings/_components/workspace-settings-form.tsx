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
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Rows } from "@/components/ui/layout/rows";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { storeActiveOrganizationSlugAction } from "./workspace-settings-actions";
import { workspaceSettingsFormMessages } from "./workspace-settings-form.messages";

export function WorkspaceSettingsForm({
  canUpdateWorkspace,
  organizationName,
  organizationSlug,
}: {
  canUpdateWorkspace: boolean;
  organizationName: string;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const router = useRouter();
  const { client } = useGoSvcClient();
  const [name, setName] = useState(organizationName);
  const [slug, setSlug] = useState(organizationSlug);

  const updateWorkspace = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim().toLowerCase();
      const result = await client.workspace.update(organizationSlug, {
        name: trimmedName,
        slug: trimmedSlug,
      });
      const nextSlug = result.workspace.slug ?? organizationSlug;
      try {
        await storeActiveOrganizationSlugAction(nextSlug);
      } catch {
        // The redirect still lands on the new slug; app-auth repairs a stale cookie.
      }
      return result;
    },
    onSuccess: (data) => {
      toast.success(intl.formatMessage(workspaceSettingsFormMessages.updatedToast));
      const nextSlug = data.workspace.slug ?? organizationSlug;
      router.replace(data.redirectTo);
      router.refresh();
      setName(data.workspace.name);
      setSlug(nextSlug);
    },
    onError: (error) => {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(workspaceSettingsFormMessages.updateFailed)),
      );
    },
  });

  const hasChanges =
    name.trim() !== organizationName || slug.trim().toLowerCase() !== organizationSlug;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (hasChanges) {
          updateWorkspace.mutate();
        }
      }}
    >
      <FieldGroup>
        <Rows spacing="3u">
          <Field>
            <FieldLabel
              htmlFor="workspace-name"
              className="text-xs font-medium text-muted-foreground"
            >
              <FormattedMessage {...workspaceSettingsFormMessages.organizationNameLabel} />
            </FieldLabel>
            <Input
              id="workspace-name"
              value={name}
              readOnly={!canUpdateWorkspace}
              onChange={(event) => setName(event.target.value)}
              className="h-10"
            />
          </Field>
          <Field>
            <FieldLabel
              htmlFor="workspace-slug"
              className="text-xs font-medium text-muted-foreground"
            >
              <FormattedMessage {...workspaceSettingsFormMessages.workspaceSlugLabel} />
            </FieldLabel>
            <Input
              id="workspace-slug"
              value={slug}
              readOnly={!canUpdateWorkspace}
              onChange={(event) => setSlug(event.target.value)}
              className="h-10"
            />
            <FieldDescription className="text-xs text-subtle-foreground">
              <FormattedMessage {...workspaceSettingsFormMessages.slugHelp} />
            </FieldDescription>
          </Field>
          {canUpdateWorkspace ? (
            <Button type="submit" disabled={!hasChanges || updateWorkspace.isPending}>
              <FormattedMessage {...workspaceSettingsFormMessages.save} />
            </Button>
          ) : null}
        </Rows>
      </FieldGroup>
    </form>
  );
}
