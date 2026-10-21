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

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type {
  WorkspaceAutomationFieldErrors,
  WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

export function WorkspaceAutomationGoogleDriveSettings({
  organizationSlug,
  form,
  setForm,
  fieldErrors,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  setForm: (next: WorkspaceAutomationFormState) => void;
  fieldErrors: WorkspaceAutomationFieldErrors;
}) {
  const foldersQuery = useQuery({
    queryKey: ["google-drive-folders", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["google-drive"].folders.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Google Drive folders");
      }
      const body = await response.json();
      return body.folders as Array<{ id: string; pathLabel: string }>;
    },
  });

  const folders = foldersQuery.data ?? [];

  return (
    <Rows spacing="2u">
      <TypographyP size="small" tone="subtle">
        Choose folders connected on the Integrations page. Project source and target locales come
        from the attached project.
      </TypographyP>
      {fieldErrors.googleDrive ? (
        <TypographyP size="small" tone="critical">
          {fieldErrors.googleDrive}
        </TypographyP>
      ) : null}
      {folders.length === 0 ? (
        <TypographyP size="small" tone="subtle">
          No Google Drive folders connected yet.
        </TypographyP>
      ) : (
        folders.map((folder) => {
          const checked = form.googleDriveFolderIds.includes(folder.id);
          return (
            <Label key={folder.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => {
                  const enabled = value === true;
                  setForm({
                    ...form,
                    googleDriveFolderIds: enabled
                      ? [...new Set([...form.googleDriveFolderIds, folder.id])]
                      : form.googleDriveFolderIds.filter((id) => id !== folder.id),
                  });
                }}
              />
              {folder.pathLabel}
            </Label>
          );
        })
      )}
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={form.googleDriveIncludeTranslatedFiles}
          onCheckedChange={(value) =>
            setForm({
              ...form,
              googleDriveIncludeTranslatedFiles: value === true,
            })
          }
        />
        Include files that look like translations (for example [fr-FR] Report.docx)
      </Label>
    </Rows>
  );
}
