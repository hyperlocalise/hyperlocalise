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
import { useMemo, useState } from "react";
import { useIntl, type IntlShape } from "react-intl";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import {
  buildProjectFileContentEditorHref,
  canOpenProjectFileContentEditor,
} from "@/lib/projects/project-file-content-editor-routing";
import { sourcePathSupportsSrxSegmentation } from "@/lib/i18n/srx/format-supports";
import {
  inferSupportedFileTranslationFileFormat,
  isSupportedSourceUploadFormat,
} from "@/lib/translation/file-formats";

import { useProjectFileActionsMessages } from "./use-project-file-actions.messages";

const EMPTY_STRING_ARRAY: readonly string[] = [];

export type ProjectFileActionCapabilities = {
  canOpenCat: boolean;
  canTranslateWithAgent: boolean;
  contentEditorHref: ReturnType<typeof buildProjectFileContentEditorHref>;
  isNativeFile: boolean;
  canConfigureSegmentation: boolean;
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
  const canOpenCat = canOpenProjectFileContentEditor(file);
  const canTranslateWithAgent =
    isNativeFile &&
    Boolean(file.storedFileId) &&
    (isSupportedSourceUploadFormat(file.sourcePath) ||
      Boolean(inferSupportedFileTranslationFileFormat(file.sourcePath))) &&
    targetLocales.length > 0;
  const contentEditorHref = buildProjectFileContentEditorHref(
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
    canConfigureSegmentation: isNativeFile && sourcePathSupportsSrxSegmentation(file.sourcePath),
    contentEditorHref,
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
  const [segmentationDialogOpen, setSegmentationDialogOpen] = useState(false);

  const {
    canOpenCat,
    canTranslateWithAgent,
    canConfigureSegmentation,
    contentEditorHref,
    isNativeFile,
    translateDisabledTitle,
  } = buildProjectFileActionCapabilities({
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
    canConfigureSegmentation,
    canTranslateWithAgent,
    contentEditorHref,
    downloadDialogOpen,
    highlightLocale,
    importDialogOpen,
    isNativeFile,
    nativeSourcePaths,
    organizationSlug,
    projectId,
    segmentationDialogOpen,
    setDownloadDialogOpen,
    setImportDialogOpen,
    setSegmentationDialogOpen,
    setTranslateDialogOpen,
    sourceLocale,
    stableTargetLocales,
    targetLocales,
    translateDialogOpen,
    translateDisabledTitle,
  };
}
