"use client";

import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Download01Icon, TranslateIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import type { ContextMenuOpenContext } from "@pierre/trees";
import { Button } from "@/components/ui/button";

import type { ProjectFileActionCapabilities } from "./use-project-file-actions";

export type ProjectFileTreeActionsConfig = {
  organizationSlug: string;
  projectId: string;
  highlightLocale: string | null;
  projectTargetLocales?: readonly string[] | null;
  sourceLocale?: string;
  nativeSourcePaths?: readonly string[];
  branch?: string | null;
  onViewStrings: (file: ProjectFileRecord) => void;
  onTranslateFile?: (file: ProjectFileRecord) => void;
  onImportFile?: (file: ProjectFileRecord) => void;
  onDownloadFile?: (file: ProjectFileRecord) => void;
};

const MENU_MIN_WIDTH_PX = 208;
const MENU_VIEWPORT_GAP_PX = 8;
const MENU_OFFSET_PX = 4;

function lockWindowScroll(): () => void {
  const { body, documentElement } = document;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
  const previousOverflow = body.style.overflow;
  const previousPaddingRight = body.style.paddingRight;
  body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
  return () => {
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPaddingRight;
  };
}

function useWindowScrollLock() {
  useEffect(() => lockWindowScroll(), []);
}

function resolveMenuStyle(context: ContextMenuOpenContext): CSSProperties {
  const elementRect = context.anchorElement?.getBoundingClientRect();
  const rect =
    context.anchorRect ??
    (elementRect
      ? {
          top: elementRect.top,
          right: elementRect.right,
          bottom: elementRect.bottom,
          left: elementRect.left,
          width: elementRect.width,
          height: elementRect.height,
        }
      : null);

  if (!rect) {
    return {
      position: "fixed",
      top: MENU_VIEWPORT_GAP_PX,
      left: MENU_VIEWPORT_GAP_PX,
      zIndex: 50,
    };
  }

  const preferredLeft = rect.right - MENU_MIN_WIDTH_PX;
  const maxLeft = window.innerWidth - MENU_MIN_WIDTH_PX - MENU_VIEWPORT_GAP_PX;
  const left = Math.min(
    Math.max(MENU_VIEWPORT_GAP_PX, preferredLeft),
    Math.max(MENU_VIEWPORT_GAP_PX, maxLeft),
  );
  const preferredTop = rect.bottom + MENU_OFFSET_PX;
  const estimatedHeight = 220;
  const top =
    preferredTop + estimatedHeight > window.innerHeight - MENU_VIEWPORT_GAP_PX
      ? Math.max(MENU_VIEWPORT_GAP_PX, rect.top - estimatedHeight - MENU_OFFSET_PX)
      : preferredTop;

  return {
    position: "fixed",
    top,
    left,
    zIndex: 50,
  };
}

export function ProjectFileTreeContextMenu({
  file,
  context,
  fileActions,
  capabilities,
}: {
  file: ProjectFileRecord;
  context: ContextMenuOpenContext;
  fileActions: ProjectFileTreeActionsConfig;
  capabilities: ProjectFileActionCapabilities;
}) {
  useWindowScrollLock();
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>(() => resolveMenuStyle(context));

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    setMenuStyle(resolveMenuStyle(context));
  }, [context]);

  const closeMenu = () => {
    context.close({ restoreFocus: false });
  };

  const menu = (
    <div
      className="flex min-w-52 flex-col gap-1 rounded-md border bg-background p-2 shadow"
      data-file-tree-context-menu-root="true"
      style={menuStyle}
    >
      <Button
        type="button"
        size="sm"
        className="w-full justify-start"
        disabled={!capabilities.canOpenCat || !capabilities.catHref}
        onClick={() => {
          closeMenu();
          if (capabilities.canOpenCat) {
            fileActions.onViewStrings(file);
          }
        }}
      >
        <ListIcon />
        View strings
      </Button>
      {capabilities.isNativeFile ? (
        <>
          <Button
            type="button"
            size="sm"
            className="w-full justify-start"
            disabled={!capabilities.canTranslateWithAgent}
            title={capabilities.translateDisabledTitle}
            onClick={() => {
              fileActions.onTranslateFile?.(file);
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
              fileActions.onImportFile?.(file);
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
              fileActions.onDownloadFile?.(file);
              closeMenu();
            }}
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
            Download
          </Button>
        </>
      ) : null}
    </div>
  );

  if (!mounted) {
    return null;
  }

  return createPortal(menu, document.body);
}
