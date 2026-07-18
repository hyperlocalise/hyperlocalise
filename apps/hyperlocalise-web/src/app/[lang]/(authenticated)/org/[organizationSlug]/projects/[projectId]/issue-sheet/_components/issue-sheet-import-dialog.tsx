"use client";

import { useMemo, useRef, useState } from "react";
import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import {
  issueSheetSystemFields,
  parseIssueSheetImportCsv,
  suggestIssueSheetImportMappings,
  type IssueSheetImportColumnMapping,
  type IssueSheetImportColumnType,
  type IssueSheetSuggestedMapping,
  type IssueSheetSystemField,
} from "@/lib/projects/issue-sheet/issue-sheet-csv-import";

import { issueSheetImportDialogMessages as messages } from "./issue-sheet-import-dialog.messages";
import { issueSheetSharedMessages as sharedMessages } from "./issue-sheet-shared.messages";

type IssueSheetColumn = {
  id: string;
  key: string;
  label: string;
  type: string;
};

type ImportResponse = {
  import: {
    dryRun: boolean;
    totalRows: number;
    created: number;
    skippedDuplicates: number;
    skippedInvalid: number;
    warnings: { row: number; message: string }[];
    errors: { row: number; message: string }[];
    columnsCreated: { key: string; label: string }[];
  };
};

type ImportStep = "upload" | "map" | "preview" | "done";

const createTypeValues: IssueSheetImportColumnType[] = ["text", "long_text", "select"];

function issueSheetImportPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet/import`;
}

async function readJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, fallbackMessage);
    throw new Error(error.message || fallbackMessage);
  }
  return (await response.json()) as T;
}

function systemFieldLabel(intl: IntlShape, field: IssueSheetSystemField) {
  switch (field) {
    case "title":
      return intl.formatMessage(messages.systemFieldTitle);
    case "description":
      return intl.formatMessage(messages.systemFieldDescription);
    case "status":
      return intl.formatMessage(messages.systemFieldStatus);
    case "issue_type":
      return intl.formatMessage(messages.systemFieldType);
    case "target_locale":
      return intl.formatMessage(messages.systemFieldLocale);
    case "source_path":
      return intl.formatMessage(messages.systemFieldSourcePath);
    case "segment_id":
      return intl.formatMessage(messages.systemFieldSegmentId);
    case "external_ref":
      return intl.formatMessage(messages.systemFieldExternalId);
    case "link_url":
      return intl.formatMessage(messages.systemFieldLinkUrl);
    case "assignee":
      return intl.formatMessage(messages.systemFieldAssignee);
  }
}

function createTypeLabel(intl: IntlShape, type: IssueSheetImportColumnType) {
  switch (type) {
    case "text":
      return intl.formatMessage(sharedMessages.columnTypeText);
    case "long_text":
      return intl.formatMessage(sharedMessages.columnTypeLongText);
    case "select":
      return intl.formatMessage(sharedMessages.columnTypeSelect);
  }
}

function buildMappingOptions(columns: IssueSheetColumn[], intl: IntlShape) {
  const options: { value: string; label: string; target: IssueSheetImportColumnMapping }[] = [
    {
      value: "skip",
      label: intl.formatMessage(messages.skipMapping),
      target: { kind: "skip" },
    },
  ];

  for (const field of issueSheetSystemFields()) {
    options.push({
      value: `system:${field}`,
      label: systemFieldLabel(intl, field),
      target: { kind: "system", field },
    });
  }

  for (const column of columns) {
    if (column.type === "enrichment") {
      continue;
    }
    options.push({
      value: `column:${column.id}`,
      label: column.label,
      target: { kind: "column", columnId: column.id },
    });
  }

  return options;
}

function mappingToSelectValue(target: IssueSheetImportColumnMapping) {
  if (target.kind === "skip") {
    return "skip";
  }
  if (target.kind === "system") {
    return `system:${target.field}`;
  }
  if (target.kind === "column") {
    return `column:${target.columnId}`;
  }
  return `create:${target.key}`;
}

export function IssueSheetImportDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  columns,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  columns: IssueSheetColumn[];
  onImported: () => Promise<void>;
}) {
  const intl = useIntl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("upload");
  const [csvContent, setCsvContent] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<IssueSheetSuggestedMapping[]>([]);
  const [previewResult, setPreviewResult] = useState<ImportResponse["import"] | null>(null);

  const emptyValue = intl.formatMessage(sharedMessages.emptyValue);
  const importFailed = intl.formatMessage(messages.importFailed);

  const mappingOptions = useMemo(() => buildMappingOptions(columns, intl), [columns, intl]);

  const createTypeItems = createTypeValues.map((value) => ({
    value,
    label: createTypeLabel(intl, value),
  }));

  const reset = () => {
    setStep("upload");
    setCsvContent("");
    setHeaders([]);
    setPreviewRows([]);
    setMappings([]);
    setPreviewResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const importMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const response = await fetch(issueSheetImportPath(organizationSlug, projectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: csvContent,
          dryRun,
          mapping: mappings.map((entry) => ({
            csvHeader: entry.csvHeader,
            target: entry.target,
          })),
          options: { skipInvalidRows: true },
        }),
      });
      return readJsonOrThrow<ImportResponse>(response, importFailed);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : importFailed),
  });

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error(intl.formatMessage(messages.uploadCsvRequired));
      return;
    }

    const content = await file.text();
    try {
      const parsed = parseIssueSheetImportCsv(content);
      const suggestions = suggestIssueSheetImportMappings({
        headers: parsed.headers,
        rows: parsed.rows,
        columns: columns.map((column) => ({
          id: column.id,
          key: column.key,
          label: column.label,
        })),
      });
      setCsvContent(content);
      setHeaders(parsed.headers);
      setPreviewRows(parsed.rows.slice(0, 5));
      setMappings(suggestions);
      setPreviewResult(null);
      setStep("map");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.parseCsvFailed),
      );
    }
  };

  const updateMapping = (csvHeader: string, optionValue: string) => {
    setMappings((current) =>
      current.map((entry) => {
        if (entry.csvHeader !== csvHeader) {
          return entry;
        }
        const option = mappingOptions.find((item) => item.value === optionValue);
        if (option) {
          return { csvHeader, target: option.target };
        }
        return entry;
      }),
    );
  };

  const updateCreateType = (csvHeader: string, type: IssueSheetImportColumnType) => {
    setMappings((current) =>
      current.map((entry) => {
        if (entry.csvHeader !== csvHeader || entry.target.kind !== "create") {
          return entry;
        }
        return {
          csvHeader,
          target: { ...entry.target, type },
        };
      }),
    );
  };

  const runPreview = async () => {
    const result = await importMutation.mutateAsync(true);
    setPreviewResult(result.import);
    setStep("preview");
  };

  const runImport = async () => {
    const result = await importMutation.mutateAsync(false);
    setPreviewResult(result.import);
    await onImported();
    toast.success(intl.formatMessage(messages.importSuccess, { count: result.import.created }));
    setStep("done");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          close();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            <button
              type="button"
              className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/20 px-6 py-10 text-center"
              onClick={() => fileInputRef.current?.click()}
            >
              <HugeiconsIcon icon={Upload01Icon} className="size-8 text-muted-foreground" />
              <div>
                <TypographyP className="font-medium">
                  <FormattedMessage {...messages.chooseCsvFile} />
                </TypographyP>
                <TypographyP className="text-sm text-muted-foreground">
                  <FormattedMessage {...messages.csvLimits} />
                </TypographyP>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  void handleFile(file);
                }
              }}
            />
          </div>
        ) : null}

        {step === "map" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                <FormattedMessage {...messages.columnsBadge} values={{ count: headers.length }} />
              </Badge>
              <Badge variant="secondary">
                <FormattedMessage
                  {...messages.previewRowsBadge}
                  values={{ count: previewRows.length }}
                />
              </Badge>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">
                      <FormattedMessage {...messages.csvColumnHeader} />
                    </th>
                    <th className="px-3 py-2 font-medium">
                      <FormattedMessage {...messages.mapsToHeader} />
                    </th>
                    <th className="px-3 py-2 font-medium">
                      <FormattedMessage {...messages.sampleHeader} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mappings.map((entry) => {
                    const columnIndex = headers.indexOf(entry.csvHeader);
                    const sample =
                      previewRows
                        .map((row) => row[columnIndex] ?? "")
                        .find((value) => value.trim()) ?? emptyValue;
                    const createLabel =
                      entry.target.kind === "create"
                        ? intl.formatMessage(messages.createMapping, {
                            label: entry.target.label,
                          })
                        : null;
                    return (
                      <tr key={entry.csvHeader}>
                        <td className="px-3 py-3 font-medium">{entry.csvHeader}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-2">
                            <Select
                              value={mappingToSelectValue(entry.target)}
                              onValueChange={(value) =>
                                updateMapping(entry.csvHeader, value ?? "skip")
                              }
                            >
                              <SelectTrigger className="w-full min-w-48">
                                <SelectValue
                                  placeholder={intl.formatMessage(messages.chooseMapping)}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {mappingOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                    label={option.label}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                                {entry.target.kind === "create" && createLabel ? (
                                  <SelectItem
                                    value={`create:${entry.target.key}`}
                                    label={createLabel}
                                  >
                                    {createLabel}
                                  </SelectItem>
                                ) : null}
                              </SelectContent>
                            </Select>
                            {entry.target.kind === "create" ? (
                              <Select
                                value={entry.target.type}
                                onValueChange={(value) =>
                                  updateCreateType(
                                    entry.csvHeader,
                                    (value ?? "text") as IssueSheetImportColumnType,
                                  )
                                }
                              >
                                <SelectTrigger className="w-full min-w-48">
                                  <SelectValue
                                    placeholder={intl.formatMessage(messages.columnTypePlaceholder)}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {createTypeItems.map((type) => (
                                    <SelectItem
                                      key={type.value}
                                      value={type.value}
                                      label={type.label}
                                    >
                                      {type.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                          </div>
                        </td>
                        <td className="max-w-56 truncate px-3 py-3 text-muted-foreground">
                          {sample}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {step === "preview" && previewResult ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                <FormattedMessage
                  {...messages.rowsBadge}
                  values={{ count: previewResult.totalRows }}
                />
              </Badge>
              <Badge variant="success">
                <FormattedMessage
                  {...messages.toImportBadge}
                  values={{ count: previewResult.created }}
                />
              </Badge>
              <Badge variant="outline">
                <FormattedMessage
                  {...messages.duplicatesSkippedBadge}
                  values={{ count: previewResult.skippedDuplicates }}
                />
              </Badge>
              <Badge variant="warning">
                <FormattedMessage
                  {...messages.invalidSkippedBadge}
                  values={{ count: previewResult.skippedInvalid }}
                />
              </Badge>
            </div>
            {previewResult.columnsCreated.length > 0 ? (
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage
                  {...messages.newColumns}
                  values={{
                    columns: previewResult.columnsCreated.map((column) => column.label).join(", "),
                  }}
                />
              </TypographyP>
            ) : null}
            {previewResult.warnings.length > 0 ? (
              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                <p className="font-medium">
                  <FormattedMessage {...messages.warningsTitle} />
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {previewResult.warnings.slice(0, 8).map((warning, index) => (
                    <li key={`${warning.row}-${index}`}>
                      {warning.row > 0
                        ? intl.formatMessage(messages.rowMessage, {
                            row: warning.row,
                            message: warning.message,
                          })
                        : warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {previewResult.errors.length > 0 ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">
                  <FormattedMessage {...messages.errorsTitle} />
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {previewResult.errors.slice(0, 8).map((error, index) => (
                    <li key={`${error.row}-${index}`}>
                      {intl.formatMessage(messages.rowMessage, {
                        row: error.row,
                        message: error.message,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "done" && previewResult ? (
          <div className="space-y-3">
            <TypographyP className="text-sm">
              {[
                intl.formatMessage(messages.importSummaryCreated, {
                  count: previewResult.created,
                }),
                intl.formatMessage(messages.importSummaryDuplicates, {
                  count: previewResult.skippedDuplicates,
                }),
                intl.formatMessage(messages.importSummaryInvalid, {
                  count: previewResult.skippedInvalid,
                }),
              ].join(" ")}
            </TypographyP>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={close}>
            <FormattedMessage {...messages.close} />
          </Button>
          <div className="flex flex-wrap gap-2">
            {step === "map" ? (
              <>
                <Button variant="outline" onClick={() => setStep("upload")}>
                  <FormattedMessage {...messages.back} />
                </Button>
                <Button onClick={() => void runPreview()} disabled={importMutation.isPending}>
                  <FormattedMessage {...messages.previewImport} />
                </Button>
              </>
            ) : null}
            {step === "preview" ? (
              <>
                <Button variant="outline" onClick={() => setStep("map")}>
                  <FormattedMessage {...messages.back} />
                </Button>
                <Button
                  onClick={() => void runImport()}
                  disabled={importMutation.isPending || previewResult?.created === 0}
                >
                  <FormattedMessage
                    {...messages.importIssues}
                    values={{ count: previewResult?.created ?? 0 }}
                  />
                </Button>
              </>
            ) : null}
            {step === "done" ? (
              <Button onClick={close}>
                <FormattedMessage {...messages.done} />
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
