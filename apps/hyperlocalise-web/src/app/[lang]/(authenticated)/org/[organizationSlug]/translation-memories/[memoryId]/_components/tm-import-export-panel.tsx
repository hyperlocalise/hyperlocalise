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
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { TmEntryLocaleField } from "./tm-entry-locale-field";
import { buildTmEntryLocaleOptions } from "./tm-entry-list-state";
import { tmImportExportPanelMessages as messages } from "./tm-import-export-panel.messages";

type PendingImport = {
  format: "csv" | "tmx";
  content: string;
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
}: {
  organizationSlug: string;
  memoryId: string;
  localeCoverage: string[];
  canEdit: boolean;
  onImported: () => Promise<void> | void;
}) {
  const intl = useIntl();
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [preview, setPreview] = useState<MemoryImportResponse | null>(null);
  const [result, setResult] = useState<MemoryImportResponse | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSourceLocale, setExportSourceLocale] = useState(localeCoverage[0] ?? "en-US");
  const [exportTargetLocale, setExportTargetLocale] = useState(localeCoverage[1] ?? "fr-FR");

  const previewImport = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".tmx") ? ("tmx" as const) : ("csv" as const);
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries["import"].$post({
        param: { organizationSlug, memoryId },
        json: { format, content, dryRun: true },
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.importFailed)));
      }
      return { format, content, body: (await response.json()) as MemoryImportResponse };
    },
    onSuccess: ({ format, content, body }) => {
      setPendingImport({ format, content });
      setPreview(body);
    },
    onError: (error) => toast.error(error.message),
  });

  const confirmImport = useMutation({
    mutationFn: async (pending: PendingImport) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries["import"].$post({
        param: { organizationSlug, memoryId },
        json: { format: pending.format, content: pending.content, dryRun: false },
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.importFailed)));
      }
      return (await response.json()) as MemoryImportResponse;
    },
    onSuccess: async (body) => {
      setPreview(null);
      setPendingImport(null);
      setResult(body);
      await onImported();
      toast.success(
        intl.formatMessage(messages.entriesImported, {
          created: body.report.created + body.report.variantCreated,
          updated: body.report.updated,
        }),
      );
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
      {canEdit ? (
        <Input
          type="file"
          accept=".csv,.tmx,text/csv,application/xml,text/xml"
          aria-label={intl.formatMessage(messages.importLabel)}
          className="max-w-xs"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) previewImport.mutate(file);
            event.currentTarget.value = "";
          }}
        />
      ) : null}
      <Button type="button" variant="outline" onClick={() => setExportOpen(true)}>
        <FormattedMessage {...messages.exportTmx} />
      </Button>

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

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.resultTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.resultDescription} />
            </DialogDescription>
          </DialogHeader>
          {result ? <ImportReportBody report={result} /> : null}
          <DialogFooter>
            <Button type="button" onClick={() => setResult(null)}>
              <FormattedMessage {...messages.closeReport} />
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
          <TypographyP key={item.key} className="rounded-md border border-border px-2 py-1 text-xs">
            <FormattedMessage {...item.message} values={{ count: item.count }} />
          </TypographyP>
        ))}
      </div>
      {report.preview.length > 0 ? (
        <div className="grid gap-2">
          <TypographyP className="text-sm font-medium">
            <FormattedMessage {...messages.previewEntriesTitle} />
          </TypographyP>
          <div className="max-h-48 overflow-auto rounded-md border border-border">
            {report.preview.map((entry, index) => (
              <div
                key={`${entry.externalKey ?? entry.sourceText}-${index}`}
                className="border-b border-border px-3 py-2 last:border-b-0"
              >
                <TypographyP className="text-xs text-muted-foreground">
                  {entry.sourceLocale} → {entry.targetLocale} · {entry.action}
                </TypographyP>
                <TypographyP className="text-sm">{entry.sourceText}</TypographyP>
                <TypographyP className="text-sm text-muted-foreground">
                  {entry.targetText}
                </TypographyP>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {report.report.issues.length > 0 ? (
        <div className="grid gap-2">
          <TypographyP className="text-sm font-medium">
            <FormattedMessage {...messages.issuesTitle} />
          </TypographyP>
          <ul className="max-h-40 overflow-auto rounded-md border border-border px-3 py-2 text-xs">
            {report.report.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.unitIndex ?? index}`} className="py-1">
                {issue.unitIndex ? `#${issue.unitIndex} · ` : null}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
