"use client";

import { useMemo, useRef, useState } from "react";
import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
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
  issueSheetSystemFieldLabel,
  issueSheetSystemFields,
  parseIssueSheetImportCsv,
  suggestIssueSheetImportMappings,
  type IssueSheetImportColumnMapping,
  type IssueSheetImportColumnType,
  type IssueSheetSuggestedMapping,
} from "@/lib/projects/issue-sheet/issue-sheet-csv-import";

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

const createTypes: { value: IssueSheetImportColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "long_text", label: "Long text" },
  { value: "select", label: "Select" },
];

function issueSheetImportPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet/import`;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, "Import failed");
    throw new Error(error.message || "Import failed");
  }
  return (await response.json()) as T;
}

function buildMappingOptions(columns: IssueSheetColumn[]) {
  const options: { value: string; label: string; target: IssueSheetImportColumnMapping }[] = [
    { value: "skip", label: "Skip", target: { kind: "skip" } },
  ];

  for (const field of issueSheetSystemFields()) {
    options.push({
      value: `system:${field}`,
      label: issueSheetSystemFieldLabel(field),
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("upload");
  const [csvContent, setCsvContent] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<IssueSheetSuggestedMapping[]>([]);
  const [previewResult, setPreviewResult] = useState<ImportResponse["import"] | null>(null);

  const mappingOptions = useMemo(() => buildMappingOptions(columns), [columns]);

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
      return readJsonOrThrow<ImportResponse>(response);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Import failed"),
  });

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Upload a UTF-8 CSV file");
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
      toast.error(error instanceof Error ? error.message : "Could not parse CSV");
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
    toast.success(`Imported ${result.import.created} issues`);
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
          <DialogTitle>Import issues from CSV</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet export, map columns to Issue Sheet fields, preview the result, then
            import.
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
                <TypographyP className="font-medium">Choose a CSV file</TypographyP>
                <TypographyP className="text-sm text-muted-foreground">
                  UTF-8 CSV up to 2 MB and 2,000 rows
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
              <Badge variant="secondary">{headers.length} columns</Badge>
              <Badge variant="secondary">{previewRows.length} preview rows</Badge>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">CSV column</th>
                    <th className="px-3 py-2 font-medium">Maps to</th>
                    <th className="px-3 py-2 font-medium">Sample</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mappings.map((entry) => {
                    const columnIndex = headers.indexOf(entry.csvHeader);
                    const sample =
                      previewRows
                        .map((row) => row[columnIndex] ?? "")
                        .find((value) => value.trim()) ?? "—";
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
                                <SelectValue placeholder="Choose mapping" />
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
                                {entry.target.kind === "create" ? (
                                  <SelectItem
                                    value={`create:${entry.target.key}`}
                                    label={`Create: ${entry.target.label}`}
                                  >
                                    Create: {entry.target.label}
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
                                  <SelectValue placeholder="Column type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {createTypes.map((type) => (
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
              <Badge variant="secondary">{previewResult.totalRows} rows</Badge>
              <Badge variant="success">{previewResult.created} to import</Badge>
              <Badge variant="outline">{previewResult.skippedDuplicates} duplicates skipped</Badge>
              <Badge variant="warning">{previewResult.skippedInvalid} invalid skipped</Badge>
            </div>
            {previewResult.columnsCreated.length > 0 ? (
              <TypographyP className="text-sm text-muted-foreground">
                New columns: {previewResult.columnsCreated.map((column) => column.label).join(", ")}
              </TypographyP>
            ) : null}
            {previewResult.warnings.length > 0 ? (
              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                <p className="font-medium">Warnings</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {previewResult.warnings.slice(0, 8).map((warning, index) => (
                    <li key={`${warning.row}-${index}`}>
                      {warning.row > 0 ? `Row ${warning.row}: ` : ""}
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {previewResult.errors.length > 0 ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Errors</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {previewResult.errors.slice(0, 8).map((error, index) => (
                    <li key={`${error.row}-${index}`}>
                      Row {error.row}: {error.message}
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
              Imported {previewResult.created} issues. Skipped {previewResult.skippedDuplicates}{" "}
              duplicates and {previewResult.skippedInvalid} invalid rows.
            </TypographyP>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
          <div className="flex flex-wrap gap-2">
            {step === "map" ? (
              <>
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Back
                </Button>
                <Button onClick={() => void runPreview()} disabled={importMutation.isPending}>
                  Preview import
                </Button>
              </>
            ) : null}
            {step === "preview" ? (
              <>
                <Button variant="outline" onClick={() => setStep("map")}>
                  Back
                </Button>
                <Button
                  onClick={() => void runImport()}
                  disabled={importMutation.isPending || previewResult?.created === 0}
                >
                  Import {previewResult?.created ?? 0} issues
                </Button>
              </>
            ) : null}
            {step === "done" ? <Button onClick={close}>Done</Button> : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
