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
import { useMemo, useState } from "react";
import { useIntl, type IntlShape } from "react-intl";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import {
  buildProjectFileCatHref,
  canOpenProjectFileCat,
} from "@/lib/projects/project-file-cat-routing";
import {
  inferSupportedFileTranslationFileFormat,
  isSupportedSourceUploadFormat,
} from "@/lib/translation/file-formats";

import { useProjectFileActionsMessages } from "./use-project-file-actions.messages";

const EMPTY_STRING_ARRAY: readonly string[] = [];

export type ProjectFileActionCapabilities = {
  canOpenCat: boolean;
  canTranslateWithAgent: boolean;
  catHref: ReturnType<typeof buildProjectFileCatHref>;
  isNativeFile: boolean;
  translateDisabledTitle: string | undefined;
};

export function buildProjectFileActionCapabilities({
  organizationSlug,
  projectId,
  file,
  highlightLocale,
  projectTargetLocales,
  branch = null,
  intl,
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord;
  highlightLocale: string | null;
  projectTargetLocales?: readonly string[] | null;
  branch?: string | null;
  intl: IntlShape;
}): ProjectFileActionCapabilities {
  const isNativeFile = !file.provider;
  const targetLocales = projectTargetLocales ?? EMPTY_STRING_ARRAY;
  const canOpenCat = canOpenProjectFileCat(file);
  const canTranslateWithAgent =
    isNativeFile &&
    Boolean(file.storedFileId) &&
    (isSupportedSourceUploadFormat(file.sourcePath) ||
      Boolean(inferSupportedFileTranslationFileFormat(file.sourcePath))) &&
    targetLocales.length > 0;
  const catHref = buildProjectFileCatHref(
    organizationSlug,
    projectId,
    file,
    highlightLocale,
    branch,
    projectTargetLocales,
  );
  const translateDisabledTitle = canTranslateWithAgent
    ? undefined
    : intl.formatMessage(useProjectFileActionsMessages.translateDisabledTitle);

  return {
    canOpenCat,
    canTranslateWithAgent,
    catHref,
    isNativeFile,
    translateDisabledTitle,
  };
}

export function useProjectFileActions({
  organizationSlug,
  projectId,
  file,
  highlightLocale,
  projectTargetLocales,
  sourceLocale = "en",
  nativeSourcePaths = EMPTY_STRING_ARRAY,
  branch = null,
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord;
  highlightLocale: string | null;
  projectTargetLocales?: readonly string[] | null;
  sourceLocale?: string;
  nativeSourcePaths?: readonly string[];
  branch?: string | null;
}) {
  const intl = useIntl();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);

  const { canOpenCat, canTranslateWithAgent, catHref, isNativeFile, translateDisabledTitle } =
    buildProjectFileActionCapabilities({
      organizationSlug,
      projectId,
      file,
      highlightLocale,
      projectTargetLocales,
      branch,
      intl,
    });
  const targetLocales = projectTargetLocales ?? EMPTY_STRING_ARRAY;
  const stableTargetLocales = useMemo(() => [...targetLocales], [targetLocales]);

  return {
    branch,
    canOpenCat,
    canTranslateWithAgent,
    catHref,
    downloadDialogOpen,
    highlightLocale,
    importDialogOpen,
    isNativeFile,
    nativeSourcePaths,
    organizationSlug,
    projectId,
    setDownloadDialogOpen,
    setImportDialogOpen,
    setTranslateDialogOpen,
    sourceLocale,
    stableTargetLocales,
    targetLocales,
    translateDialogOpen,
    translateDisabledTitle,
  };
}
