"use client";

import { Download01Icon, TranslateIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import type { ContextMenuOpenContext } from "@pierre/trees";
import { Button } from "@/components/ui/button";

import type { useProjectFileActions } from "./use-project-file-actions";

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
  actions,
}: {
  file: ProjectFileRecord;
  context: ContextMenuOpenContext;
  fileActions: ProjectFileTreeActionsConfig;
  actions: ReturnType<typeof useProjectFileActions>;
}) {
  const closeMenu = () => {
    context.close({ restoreFocus: false });
  };

  return (
    <>
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
                actions.setTranslateDialogOpen(true);
                closeMenu();
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
                actions.setImportDialogOpen(true);
                closeMenu();
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
                actions.setDownloadDialogOpen(true);
                closeMenu();
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
