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
import { FormattedMessage, useIntl } from "react-intl";

import { contentEditorExportDialogMessages as messages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  contentEditorFilteredExportFormats,
  type ContentEditorFilteredExportFormat,
} from "@/lib/projects/content-editor/content-editor-filtered-export";
import { cn } from "@/lib/primitives/cn";

export function ContentEditorExportDialog({
  open,
  onOpenChange,
  filterLabel,
  format,
  onFormatChange,
  isDownloading = false,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterLabel: string;
  format: ContentEditorFilteredExportFormat;
  onFormatChange: (format: ContentEditorFilteredExportFormat) => void;
  isDownloading?: boolean;
  onDownload: (format: ContentEditorFilteredExportFormat) => void;
}) {
  const intl = useIntl();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} values={{ filter: filterLabel }} />
          </DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label={intl.formatMessage(messages.formatLabel)}
          className="flex flex-wrap gap-2"
        >
          {contentEditorFilteredExportFormats.map((option) => (
            <Button
              key={option}
              type="button"
              role="radio"
              aria-checked={format === option}
              variant="outline"
              size="sm"
              className={cn(
                "min-w-16 font-mono",
                format === option && "border-foreground bg-muted text-foreground",
              )}
              onClick={() => onFormatChange(option)}
            >
              {option.toUpperCase()}
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            disabled={isDownloading}
            onClick={() => {
              onDownload(format);
              onOpenChange(false);
            }}
          >
            {isDownloading ? <Spinner className="size-3.5 text-primary-foreground" /> : null}
            <FormattedMessage {...messages.download} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
