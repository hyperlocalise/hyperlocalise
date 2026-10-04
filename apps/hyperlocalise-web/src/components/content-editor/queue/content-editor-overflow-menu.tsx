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
import {
  DownloadSimpleIcon,
  ClockCounterClockwiseIcon,
  KeyboardIcon,
  DotsThreeIcon,
} from "@phosphor-icons/react";
import { observer } from "mobx-react-lite";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { ContentEditorActivityLogDialog } from "@/components/content-editor/activity-log/content-editor-activity-log-dialog";
import { contentEditorOverflowMenuMessages as messages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { useOptionalCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { ContentEditorFilteredExportFormat } from "@/lib/projects/content-editor/content-editor-filtered-export";

import { ContentEditorExportDialog } from "./content-editor-export-dialog";
import { ContentEditorShortcutsDialog } from "./content-editor-shortcuts-dialog";

export const ContentEditorOverflowMenu = observer(function ContentEditorOverflowMenu({
  filterLabel,
  onDownloadFilteredView,
  isDownloadingFilteredView = false,
}: {
  filterLabel: string;
  onDownloadFilteredView?: (format: ContentEditorFilteredExportFormat) => void;
  isDownloadingFilteredView?: boolean;
}) {
  const intl = useIntl();
  const store = useOptionalCatWorkspace();

  useHotkeys("?", () => store?.ui.openChromeDialog("shortcuts"), {
    enabled: Boolean(store),
    useKey: true,
    preventDefault: true,
  });

  if (!store) {
    return null;
  }

  const { page, ui } = store;
  const activityScope =
    page.showActivityLog && page.organizationSlug && page.projectId && page.activitySourcePath
      ? {
          organizationSlug: page.organizationSlug,
          projectId: page.projectId,
          sourcePath: page.activitySourcePath,
        }
      : null;
  const closeDialog = (open: boolean) => {
    if (!open) {
      ui.closeChromeDialog();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="size-8 shrink-0"
              aria-label={intl.formatMessage(messages.triggerAria)}
              title={intl.formatMessage(messages.triggerAria)}
            />
          }
        >
          {isDownloadingFilteredView ? (
            <Spinner className="size-3.5" />
          ) : (
            <DotsThreeIcon className="size-4" aria-hidden />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {onDownloadFilteredView || activityScope ? (
            <>
              <DropdownMenuGroup>
                {onDownloadFilteredView ? (
                  <DropdownMenuItem
                    disabled={isDownloadingFilteredView}
                    onClick={() => ui.openChromeDialog("export")}
                  >
                    <DownloadSimpleIcon className="size-4" aria-hidden />
                    <FormattedMessage {...messages.downloadFilteredView} />
                  </DropdownMenuItem>
                ) : null}
                {activityScope ? (
                  <DropdownMenuItem onClick={() => ui.openChromeDialog("activity")}>
                    <ClockCounterClockwiseIcon className="size-4" aria-hidden />
                    <FormattedMessage {...messages.fileActivity} />
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => ui.openChromeDialog("shortcuts")}>
              <KeyboardIcon className="size-4" aria-hidden />
              <FormattedMessage {...messages.keyboardShortcuts} />
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {onDownloadFilteredView ? (
        <ContentEditorExportDialog
          open={ui.chromeDialog === "export"}
          onOpenChange={closeDialog}
          filterLabel={filterLabel}
          format={ui.exportFormat}
          onFormatChange={(format) => ui.setExportFormat(format)}
          isDownloading={isDownloadingFilteredView}
          onDownload={onDownloadFilteredView}
        />
      ) : null}
      {activityScope ? (
        <ContentEditorActivityLogDialog
          open={ui.chromeDialog === "activity"}
          onOpenChange={closeDialog}
          {...activityScope}
        />
      ) : null}
      <ContentEditorShortcutsDialog
        open={ui.chromeDialog === "shortcuts"}
        onOpenChange={closeDialog}
      />
    </>
  );
});
