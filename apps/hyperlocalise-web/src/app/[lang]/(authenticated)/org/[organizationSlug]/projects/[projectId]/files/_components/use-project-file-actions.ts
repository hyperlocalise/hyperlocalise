"use client";

import { useMemo, useState } from "react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import {
  buildProjectFileCatHref,
  canOpenProjectFileCat,
} from "@/lib/projects/project-file-cat-routing";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

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
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord;
  highlightLocale: string | null;
  projectTargetLocales?: readonly string[] | null;
  branch?: string | null;
}): ProjectFileActionCapabilities {
  const isNativeFile = !file.provider;
  const targetLocales = projectTargetLocales ?? EMPTY_STRING_ARRAY;
  const canOpenCat = canOpenProjectFileCat(file);
  const canTranslateWithAgent =
    isNativeFile &&
    Boolean(file.storedFileId) &&
    Boolean(inferSupportedFileTranslationFileFormat(file.sourcePath)) &&
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
    : "Upload a supported file and add target locales in project settings to translate with agent.";

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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);

  const {
    canOpenCat,
    canTranslateWithAgent,
    catHref,
    isNativeFile,
    translateDisabledTitle,
  } = buildProjectFileActionCapabilities({
    organizationSlug,
    projectId,
    file,
    highlightLocale,
    projectTargetLocales,
    branch,
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
