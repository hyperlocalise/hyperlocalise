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

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Rows } from "@/components/ui/layout/rows";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import {
  GoogleDriveFolderTree,
  type GoogleDriveTreeToggleChange,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/google-drive-folder-tree";
import { googleDriveFolderManagementMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/google-drive-folder-management.messages";
import type { GoogleDriveConnectedFolder } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/google-drive-folder-management";
import { createApiClient } from "@/lib/api-client";
import type {
  WorkspaceAutomationFieldErrors,
  WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import {
  GOOGLE_DRIVE_TRANSLATION_OUTPUTS,
  resolveGoogleDriveTranslationOutput,
  type GoogleDriveTranslationOutput,
} from "@/lib/google-drive/translation-filename";

import { workspaceAutomationGoogleDriveSettingsMessages as messages } from "./workspace-automation-google-drive-settings.messages";

const api = createApiClient();

const TRANSLATION_OUTPUT_EXAMPLE: Record<GoogleDriveTranslationOutput, string> = {
  prefix: "[fr] Report.docx",
  suffix: "Report [fr].docx",
  underscore: "Report_fr.docx",
  folder: "fr/Report.docx",
};

const TRANSLATION_OUTPUT_MESSAGE: Record<
  GoogleDriveTranslationOutput,
  (typeof messages)[GoogleDriveTranslationOutput]
> = {
  prefix: messages.prefix,
  suffix: messages.suffix,
  underscore: messages.underscore,
  folder: messages.folder,
};

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
  const intl = useIntl();
  const foldersQuery = useQuery({
    queryKey: ["google-drive-folders", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["google-drive"].folders.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Google Drive folders");
      }
      const body = await response.json();
      return body.folders as GoogleDriveConnectedFolder[];
    },
  });

  const folders = foldersQuery.data ?? [];

  const selectedDriveIds = useMemo(() => {
    const selected = new Set(form.googleDriveFolderIds);
    return new Set(
      folders.filter((folder) => selected.has(folder.id)).map((folder) => folder.folderId),
    );
  }, [folders, form.googleDriveFolderIds]);

  const toggleSelection = useCallback(
    (change: {
      select: GoogleDriveTreeToggleChange[];
      unselect: GoogleDriveTreeToggleChange[];
    }) => {
      const byDriveId = new Map(folders.map((folder) => [folder.folderId, folder.id]));
      const next = new Set(form.googleDriveFolderIds);
      for (const item of change.unselect) {
        const recordId = byDriveId.get(item.node.id);
        if (recordId) {
          next.delete(recordId);
        }
      }
      for (const item of change.select) {
        const recordId = byDriveId.get(item.node.id);
        if (recordId) {
          next.add(recordId);
        }
      }
      setForm({
        ...form,
        googleDriveFolderIds: [...next],
      });
    },
    [folders, form, setForm],
  );

  return (
    <Rows spacing="2u">
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.helper} />
      </TypographyP>
      {fieldErrors.googleDrive ? (
        <TypographyP size="small" tone="critical">
          {fieldErrors.googleDrive}
        </TypographyP>
      ) : null}
      {foldersQuery.isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : folders.length === 0 ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...googleDriveFolderManagementMessages.emptyFolders} />
        </TypographyP>
      ) : (
        <GoogleDriveFolderTree
          organizationSlug={organizationSlug}
          selectedDriveIds={selectedDriveIds}
          connectedItems={folders}
          onToggle={toggleSelection}
        />
      )}
      <div className="space-y-2">
        <Label htmlFor="google-drive-translation-output">
          <FormattedMessage {...messages.translationOutputLabel} />
        </Label>
        <Select
          value={form.googleDriveTranslationOutput}
          onValueChange={(value) => {
            if (typeof value !== "string") {
              return;
            }
            setForm({
              ...form,
              googleDriveTranslationOutput: resolveGoogleDriveTranslationOutput(value),
            });
          }}
        >
          <SelectTrigger id="google-drive-translation-output" className="w-full">
            <SelectValue>
              <FormattedMessage
                {...TRANSLATION_OUTPUT_MESSAGE[form.googleDriveTranslationOutput]}
              />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GOOGLE_DRIVE_TRANSLATION_OUTPUTS.map((output) => (
              <SelectItem
                key={output}
                value={output}
                label={intl.formatMessage(TRANSLATION_OUTPUT_MESSAGE[output])}
              >
                <FormattedMessage {...TRANSLATION_OUTPUT_MESSAGE[output]} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
        <FormattedMessage
          {...messages.includeTranslatedFiles}
          values={{ example: TRANSLATION_OUTPUT_EXAMPLE[form.googleDriveTranslationOutput] }}
        />
      </Label>
    </Rows>
  );
}
