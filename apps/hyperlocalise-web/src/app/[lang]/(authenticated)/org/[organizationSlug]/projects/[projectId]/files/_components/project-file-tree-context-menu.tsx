"use client";

import { Download01Icon, TranslateIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import type { ContextMenuOpenContext } from "@pierre/trees";
import { Button } from "@/components/ui/button";

import { ProjectFileActionDialogs } from "./project-file-action-dialogs";
import { useProjectFileActions } from "./use-project-file-actions";

export type ProjectFileTreeActionsConfig = {
  organizationSlug: string;
  projectId: string;
  highlightLocale: string | null;
  projectTargetLocales?: readonly string[] | null;
  sourceLocale?: string;
  nativeSourcePaths?: readonly string[];
  branch?: string | null;
  onViewStrings: (file: ProjectFileRecord) => void;
};

export function ProjectFileTreeContextMenu({
  file,
  context,
  fileActions,
}: {
  file: ProjectFileRecord;
  context: ContextMenuOpenContext;
  fileActions: ProjectFileTreeActionsConfig;
}) {
  const actions = useProjectFileActions({
    organizationSlug: fileActions.organizationSlug,
    projectId: fileActions.projectId,
    file,
    highlightLocale: fileActions.highlightLocale,
    projectTargetLocales: fileActions.projectTargetLocales,
    sourceLocale: fileActions.sourceLocale,
    nativeSourcePaths: fileActions.nativeSourcePaths,
    branch: fileActions.branch,
  });

  const closeMenu = () => {
    context.close({ restoreFocus: false });
  };

  return (
    <>
      <ProjectFileActionDialogs file={file} actions={actions} />
      <div
        className="flex min-w-52 flex-col gap-1 rounded-md border bg-background p-2 shadow"
        data-file-tree-context-menu-root="true"
      >
        <Button
          type="button"
          size="sm"
          className="w-full justify-start"
          disabled={!actions.canOpenCat || !actions.catHref}
          onClick={() => {
            closeMenu();
            if (actions.canOpenCat) {
              fileActions.onViewStrings(file);
            }
          }}
        >
          <ListIcon />
          View strings
        </Button>
        {actions.isNativeFile ? (
          <>
            <Button
              type="button"
              size="sm"
              className="w-full justify-start"
              disabled={!actions.canTranslateWithAgent}
              title={actions.translateDisabledTitle}
              onClick={() => {
                closeMenu();
                actions.setTranslateDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={TranslateIcon} strokeWidth={1.8} />
              Translate with agent
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                closeMenu();
                actions.setImportDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
              Import translations
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                closeMenu();
                actions.setDownloadDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
              Download
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}
