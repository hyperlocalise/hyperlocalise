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
import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { contentEditorImportDialogMessages as messages } from "@/components/content-editor/shared/content-editor-chrome.messages";
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
import type { CatBilingualImportCounts } from "@/lib/projects/content-editor/content-editor-bilingual-import";
import { catBilingualImportAccept } from "@/lib/projects/content-editor/content-editor-filtered-export";

export function ContentEditorImportDialog({
  open,
  onOpenChange,
  locale,
  isImporting = false,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  isImporting?: boolean;
  onImport: (file: File) => Promise<CatBilingualImportCounts>;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedFile(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} values={{ locale }} />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            <FormattedMessage {...messages.fileLabel} />
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={catBilingualImportAccept}
            className="sr-only"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isImporting}
            >
              <FormattedMessage {...messages.chooseFile} />
            </Button>
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {selectedFile ? selectedFile.name : <FormattedMessage {...messages.noFileSelected} />}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            disabled={isImporting || !selectedFile}
            onClick={() => {
              if (!selectedFile) {
                return;
              }
              void onImport(selectedFile)
                .then((result) => {
                  if (result.imported <= 0) {
                    toast.success(intl.formatMessage(messages.noneImported));
                  } else {
                    const summary = [
                      intl.formatMessage(messages.importSuccess, {
                        imported: result.imported,
                      }),
                    ];
                    if (result.skipped > 0) {
                      summary.push(
                        intl.formatMessage(messages.importSkipped, { skipped: result.skipped }),
                      );
                    }
                    toast.success(summary.join(" "));
                  }
                  onOpenChange(false);
                })
                .catch((error: unknown) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : intl.formatMessage(messages.importFailed),
                  );
                });
            }}
          >
            {isImporting ? <Spinner className="size-3.5 text-primary-foreground" /> : null}
            <FormattedMessage {...messages.import} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
