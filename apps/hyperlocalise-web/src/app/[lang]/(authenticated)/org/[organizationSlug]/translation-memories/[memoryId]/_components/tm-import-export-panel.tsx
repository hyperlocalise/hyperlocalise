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
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import {
  memoryImportFormatFromFilename,
  normalizeMemoryImportUploadBytes,
} from "@/lib/memory/decode-import-file";

import { TmEntryLocaleField } from "./tm-entry-locale-field";
import { tmImportAttemptsQueryKey } from "./tm-import-history";
import { buildTmEntryLocaleOptions } from "./tm-entry-list-state";
import { tmImportExportPanelMessages as messages } from "./tm-import-export-panel.messages";

// Matches MEMORY_INTERCHANGE_MAX_BYTES in go-svc. Larger files are rejected
// before the upload so the user gets a fast, localizable error.
const MEMORY_IMPORT_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;

export function TmImportExportPanel({
  organizationSlug,
  memoryId,
  localeCoverage,
  canEdit,
  onImported,
  renderActions,
}: {
  organizationSlug: string;
  memoryId: string;
  localeCoverage: string[];
  canEdit: boolean;
  onImported: () => Promise<void> | void;
  renderActions?: (actions: { openImport: () => void; openExport: () => void }) => ReactNode;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { client: goSvcClient } = useGoSvcClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "tmx">("tmx");
  const [exportSourceLocale, setExportSourceLocale] = useState(localeCoverage[0] ?? "en-US");
  const [exportTargetLocale, setExportTargetLocale] = useState(localeCoverage[1] ?? "fr-FR");

  // Lambda-backed import: upload the file to object storage, queue preview, then
  // navigate to the report page. The report polls until preview completes.
  const startImport = useMutation({
    mutationFn: async (file: File) => {
      const format = memoryImportFormatFromFilename(file.name);
      if (!format) {
        throw new Error(intl.formatMessage(messages.unsupportedImportFormat));
      }
      if (file.size <= 0 || file.size > MEMORY_IMPORT_UPLOAD_LIMIT_BYTES) {
        throw new Error(intl.formatMessage(messages.importFileTooLarge, { maxMegabytes: 100 }));
      }
      // The Lambda parses stored bytes as UTF-8, so normalize encodings
      // (e.g. UTF-16 CSV/TMX) before upload. Re-encoded CJK text can grow,
      // so re-check the limit against the bytes actually uploaded.
      const uploadBytes = normalizeMemoryImportUploadBytes(
        new Uint8Array(await file.arrayBuffer()),
      );
      if (
        uploadBytes.byteLength <= 0 ||
        uploadBytes.byteLength > MEMORY_IMPORT_UPLOAD_LIMIT_BYTES
      ) {
        throw new Error(intl.formatMessage(messages.importFileTooLarge, { maxMegabytes: 100 }));
      }
      let upload;
      try {
        upload = await goSvcClient.memory.entries.createImportUpload(organizationSlug, memoryId, {
          format,
          sourceFilename: file.name,
          contentType: file.type || "application/octet-stream",
        });
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.importFailed)), {
          cause: error,
        });
      }
      const headers = new Headers();
      for (const [name, values] of Object.entries(upload.upload.headers)) {
        headers.set(name, values.join(","));
      }
      // Fail the upload session if the PUT or the queue request fails, so a
      // stale upload_pending attempt does not linger in import history.
      const cancelUploadSession = () => {
        void goSvcClient.memory.entries
          .cancelImport(organizationSlug, memoryId, { attemptId: upload.attemptId })
          .catch(() => undefined);
      };
      const uploaded = await fetch(upload.upload.url, {
        method: upload.upload.method,
        headers,
        // BodyInit takes ArrayBuffer but not Uint8Array under this TS DOM lib.
        body: uploadBytes.slice().buffer,
      }).catch((error: unknown) => {
        cancelUploadSession();
        throw error;
      });
      if (!uploaded.ok) {
        cancelUploadSession();
        throw new Error(intl.formatMessage(messages.uploadFailed));
      }
      try {
        return await goSvcClient.memory.entries.queueImport(organizationSlug, memoryId, {
          attemptId: upload.attemptId,
          mode: "preview",
        });
      } catch (error) {
        cancelUploadSession();
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.importFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: (queued) => {
      setImportOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void queryClient.invalidateQueries({
        queryKey: tmImportAttemptsQueryKey(organizationSlug, memoryId),
      });
      void onImported();
      router.push(
        `/org/${organizationSlug}/translation-memories/${memoryId}/imports/${queued.attemptId}`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const exportMemory = useMutation({
    mutationFn: async (input?: {
      sourceLocale?: string;
      targetLocale?: string;
      format?: "csv" | "tmx";
    }) => {
      const format = input?.format ?? exportFormat;
      try {
        return await goSvcClient.memory.entries.createExport(organizationSlug, memoryId, {
          format,
          ...(input?.sourceLocale ? { sourceLocale: input.sourceLocale } : {}),
          ...(input?.targetLocale ? { targetLocale: input.targetLocale } : {}),
        });
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.exportFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: ({ attemptId }) => {
      setExportOpen(false);
      void queryClient.invalidateQueries({
        queryKey: tmImportAttemptsQueryKey(organizationSlug, memoryId),
      });
      router.push(`/org/${organizationSlug}/translation-memories/${memoryId}/imports/${attemptId}`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {renderActions ? (
        renderActions({
          openImport: () => setImportOpen(true),
          openExport: () => setExportOpen(true),
        })
      ) : canEdit ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={startImport.isPending}
          onClick={() => setImportOpen(true)}
        >
          <FormattedMessage {...messages.import} />
        </Button>
      ) : null}

      <Dialog
        open={canEdit && importOpen}
        onOpenChange={(open) => {
          if (startImport.isPending) return;
          setImportOpen(open);
          if (!open && fileInputRef.current) fileInputRef.current.value = "";
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.importDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.importDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <input
              ref={fileInputRef}
              id="translation-memory-file-import"
              type="file"
              accept=".csv,.tmx,text/csv,application/xml,text/xml"
              className="sr-only"
              aria-label={intl.formatMessage(messages.importLabel)}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && !startImport.isPending) startImport.mutate(file);
                event.currentTarget.value = "";
              }}
            />
            <label
              htmlFor="translation-memory-file-import"
              className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-8 text-center transition-colors hover:bg-muted/40 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
              aria-busy={startImport.isPending}
            >
              {startImport.isPending ? (
                <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              ) : (
                <UploadSimpleIcon className="size-5" />
              )}
              <span className="text-sm font-medium text-foreground">
                {startImport.isPending ? (
                  <FormattedMessage {...messages.preparingImport} />
                ) : (
                  <FormattedMessage {...messages.selectImportFile} />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.importFormats} />
              </span>
            </label>
          </div>
        </DialogContent>
      </Dialog>
      {!renderActions ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <FormattedMessage {...messages.exportTmx} />
        </Button>
      ) : null}

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.exportTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.exportDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <span className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.exportFormatLabel} />
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={exportFormat === "tmx" ? "default" : "outline"}
                disabled={exportMemory.isPending}
                onClick={() => setExportFormat("tmx")}
              >
                <FormattedMessage {...messages.exportFormatTmx} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={exportFormat === "csv" ? "default" : "outline"}
                disabled={exportMemory.isPending}
                onClick={() => setExportFormat("csv")}
              >
                <FormattedMessage {...messages.exportFormatCsv} />
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TmEntryLocaleField
              label={intl.formatMessage(messages.sourceLocaleLabel)}
              value={exportSourceLocale}
              locales={buildTmEntryLocaleOptions({
                localeCoverage,
                selected: exportSourceLocale,
              })}
              onValueChange={setExportSourceLocale}
            />
            <TmEntryLocaleField
              label={intl.formatMessage(messages.targetLocaleLabel)}
              value={exportTargetLocale}
              locales={buildTmEntryLocaleOptions({
                localeCoverage,
                selected: exportTargetLocale,
              })}
              onValueChange={setExportTargetLocale}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={exportMemory.isPending}
              onClick={() => exportMemory.mutate({ format: exportFormat })}
            >
              <FormattedMessage {...messages.exportAll} />
            </Button>
            <Button
              type="button"
              disabled={
                !exportSourceLocale.trim() || !exportTargetLocale.trim() || exportMemory.isPending
              }
              onClick={() =>
                exportMemory.mutate({
                  format: exportFormat,
                  sourceLocale: exportSourceLocale.trim(),
                  targetLocale: exportTargetLocale.trim(),
                })
              }
            >
              <FormattedMessage {...messages.exportPair} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
