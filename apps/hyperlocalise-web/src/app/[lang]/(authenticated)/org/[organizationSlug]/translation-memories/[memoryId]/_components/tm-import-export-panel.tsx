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
import { useMutation } from "@tanstack/react-query";
import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { MemoryImportResponse } from "@/api/routes/memory/memory.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { readMemoryImportFile } from "@/lib/memory/decode-import-file";
import { TMX_MAX_IMPORT_CONTENT_CHARS } from "@/lib/memory/tmx/tmx-constants";

import { TmEntryLocaleField } from "./tm-entry-locale-field";
import { buildTmEntryLocaleOptions } from "./tm-entry-list-state";
import { tmImportExportPanelMessages as messages } from "./tm-import-export-panel.messages";

type PendingImport = {
  format: "csv" | "tmx";
  content: string;
  sourceFilename: string;
  sourceByteSize: number;
};

function reportCounts(report: MemoryImportResponse["report"]) {
  return [
    { key: "totalRead", count: report.totalRead, message: messages.reportTotalRead },
    { key: "created", count: report.created, message: messages.reportCreated },
    { key: "updated", count: report.updated, message: messages.reportUpdated },
    { key: "variantCreated", count: report.variantCreated, message: messages.reportVariants },
    { key: "skipped", count: report.skipped, message: messages.reportSkipped },
    { key: "warned", count: report.warned, message: messages.reportWarned },
    { key: "failed", count: report.failed, message: messages.reportFailed },
  ] as const;
}

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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [preview, setPreview] = useState<MemoryImportResponse | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSourceLocale, setExportSourceLocale] = useState(localeCoverage[0] ?? "en-US");
  const [exportTargetLocale, setExportTargetLocale] = useState(localeCoverage[1] ?? "fr-FR");

  const previewImport = useMutation({
    mutationFn: async (file: File) => {
      const decoded = await readMemoryImportFile(file);
      if (!decoded.ok) {
        throw new Error(
          intl.formatMessage(messages.importFileTooLarge, {
            maxMegabytes: Math.floor(TMX_MAX_IMPORT_CONTENT_CHARS / 1_000_000),
          }),
        );
      }
      const content = decoded.content;
      const format = file.name.toLowerCase().endsWith(".tmx") ? ("tmx" as const) : ("csv" as const);
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries["import"].$post({
        param: { organizationSlug, memoryId },
        json: {
          format,
          content,
          dryRun: true,
          sourceFilename: file.name,
          sourceByteSize: file.size,
        },
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.importFailed)));
      }
      return {
        format,
        content,
        sourceFilename: file.name,
        sourceByteSize: file.size,
        body: (await response.json()) as MemoryImportResponse,
      };
    },
    onSuccess: ({ format, content, sourceFilename, sourceByteSize, body }) => {
      setPendingImport({ format, content, sourceFilename, sourceByteSize });
      setPreview(body);
      setImportOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const confirmImport = useMutation({
    mutationFn: async (pending: PendingImport) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries["import"].$post({
        param: { organizationSlug, memoryId },
        json: {
          format: pending.format,
          content: pending.content,
          dryRun: false,
          sourceFilename: pending.sourceFilename,
          sourceByteSize: pending.sourceByteSize,
        },
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.importFailed)));
      }
      return (await response.json()) as MemoryImportResponse;
    },
    onSuccess: (body) => {
      setPreview(null);
      setPendingImport(null);
      void onImported();
      if (body.importAttemptId) {
        router.push(
          `/org/${organizationSlug}/translation-memories/${memoryId}/imports/${body.importAttemptId}`,
        );
      } else {
        toast.error(intl.formatMessage(messages.importFailed));
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const exportTmx = useMutation({
    mutationFn: async (filters?: { sourceLocale?: string; targetLocale?: string }) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries.export.$get({
        param: { organizationSlug, memoryId },
        query: {
          format: "tmx",
          ...(filters?.sourceLocale ? { sourceLocale: filters.sourceLocale } : {}),
          ...(filters?.targetLocale ? { targetLocale: filters.targetLocale } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.exportFailed)));
      }
      const blob = await response.blob();
      const filename =
        response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ??
        "translation-memory.tmx";
      return { blob, filename: decodeURIComponent(filename) };
    },
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
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
          disabled={previewImport.isPending}
          onClick={() => setImportOpen(true)}
        >
          <FormattedMessage {...messages.import} />
        </Button>
      ) : null}

      <Dialog
        open={canEdit && importOpen}
        onOpenChange={(open) => {
          if (previewImport.isPending) return;
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
                if (file) previewImport.mutate(file);
                event.currentTarget.value = "";
              }}
            />
            <label
              htmlFor="translation-memory-file-import"
              className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-8 text-center transition-colors hover:bg-muted/40 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
              aria-busy={previewImport.isPending}
            >
              {previewImport.isPending ? (
                <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              ) : (
                <HugeiconsIcon icon={Upload01Icon} className="size-5" strokeWidth={1.8} />
              )}
              <span className="text-sm font-medium text-foreground">
                <FormattedMessage {...messages.selectImportFile} />
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

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !confirmImport.isPending) {
            setPreview(null);
            setPendingImport(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.previewTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.previewDescription} />
            </DialogDescription>
          </DialogHeader>
          {preview ? <ImportReportBody report={preview} /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPreview(null);
                setPendingImport(null);
              }}
            >
              <FormattedMessage {...messages.cancelPreview} />
            </Button>
            <Button
              type="button"
              disabled={!pendingImport || confirmImport.isPending}
              onClick={() => pendingImport && confirmImport.mutate(pendingImport)}
            >
              <FormattedMessage {...messages.confirmImport} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              disabled={exportTmx.isPending}
              onClick={() => exportTmx.mutate(undefined)}
            >
              <FormattedMessage {...messages.exportAll} />
            </Button>
            <Button
              type="button"
              disabled={
                !exportSourceLocale.trim() || !exportTargetLocale.trim() || exportTmx.isPending
              }
              onClick={() =>
                exportTmx.mutate({
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

function ImportReportBody({ report }: { report: MemoryImportResponse }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {reportCounts(report.report).map((item) => (
          <TypographyP
            key={item.key}
            className="rounded-md border border-border px-2 py-1"
            size="xsmall"
          >
            <FormattedMessage {...item.message} values={{ count: item.count }} />
          </TypographyP>
        ))}
      </div>
      {report.preview.length > 0 ? (
        <div className="grid gap-2">
          <TypographyP size="small" weight="medium">
            <FormattedMessage {...messages.previewEntriesTitle} />
          </TypographyP>
          <div className="max-h-48 overflow-auto rounded-md border border-border">
            {report.preview.map((entry, index) => (
              <div
                key={`${entry.externalKey ?? entry.sourceText}-${index}`}
                className="border-b border-border px-3 py-2 last:border-b-0"
              >
                <TypographyP size="xsmall" tone="subtle">
                  {entry.sourceLocale} → {entry.targetLocale} · {entry.action}
                </TypographyP>
                <TypographyP size="small">{entry.sourceText}</TypographyP>
                <TypographyP size="small" tone="subtle">
                  {entry.targetText}
                </TypographyP>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {report.report.issues.length > 0 ? (
        <div className="grid gap-2">
          <TypographyP size="small" weight="medium">
            <FormattedMessage {...messages.issuesTitle} />
          </TypographyP>
          <ul className="max-h-40 overflow-auto rounded-md border border-border px-3 py-2 text-xs">
            {report.report.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.unitIndex ?? index}`} className="py-1">
                {issue.unitIndex !== undefined ? `#${issue.unitIndex} · ` : null}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
