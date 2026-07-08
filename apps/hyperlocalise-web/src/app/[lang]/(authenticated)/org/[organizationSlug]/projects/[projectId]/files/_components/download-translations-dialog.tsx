"use client";

import { useEffect, useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";
import { cn } from "@/lib/primitives/cn";

type DownloadTranslationsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourcePaths: string[];
  initialSourcePath: string;
  targetLocales: string[];
};

function buildDownloadHref(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
  locale: string,
) {
  const params = new URLSearchParams({ sourcePath, locale });
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/translations/download?${params.toString()}`;
}

function parseDownloadFilename(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallback;
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  return fallback;
}

async function downloadTranslationFile(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
  locale: string,
) {
  const href = buildDownloadHref(organizationSlug, projectId, sourcePath, locale);
  const response = await fetch(href);

  if (!response.ok) {
    throw await readApiResponseError(response, `Failed to download ${sourcePath}`);
  }

  const blob = await response.blob();
  const filename = parseDownloadFilename(
    response.headers.get("Content-Disposition"),
    `${sourcePath}-${locale}`,
  );
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export function DownloadTranslationsDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourcePaths,
  initialSourcePath,
  targetLocales,
}: DownloadTranslationsDialogProps) {
  const [locale, setLocale] = useState<string>(targetLocales[0] ?? "");
  const [selectedSourcePaths, setSelectedSourcePaths] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setLocale(targetLocales[0] ?? "");
    setSelectedSourcePaths(
      sourcePaths.includes(initialSourcePath) ? [initialSourcePath] : sourcePaths.slice(0, 1),
    );
  }, [initialSourcePath, open, sourcePaths, targetLocales]);

  const toggleSourcePath = (sourcePath: string) => {
    setSelectedSourcePaths((current) =>
      current.includes(sourcePath)
        ? current.filter((path) => path !== sourcePath)
        : [...current, sourcePath],
    );
  };

  const handleDownload = async () => {
    if (!locale) {
      toast.error("Select a target locale.");
      return;
    }

    if (selectedSourcePaths.length === 0) {
      toast.error("Select at least one source file.");
      return;
    }

    setIsDownloading(true);

    try {
      for (const sourcePath of selectedSourcePaths) {
        await downloadTranslationFile(organizationSlug, projectId, sourcePath, locale);
      }

      toast.success(
        selectedSourcePaths.length === 1
          ? "Translation file downloaded."
          : `${selectedSourcePaths.length} translation files downloaded.`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download translations");
    } finally {
      setIsDownloading(false);
    }
  };

  const hasSourcePaths = sourcePaths.length > 0;
  const canDownload = hasSourcePaths && targetLocales.length > 0 && selectedSourcePaths.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download translations</DialogTitle>
          <DialogDescription>
            Choose source files and a target locale to export translated content.
          </DialogDescription>
        </DialogHeader>

        {!hasSourcePaths ? (
          <p className="text-sm text-muted-foreground">
            No source files are available to download.
          </p>
        ) : targetLocales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add target locales in project settings before downloading translations.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Source files</p>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {sourcePaths.map((sourcePath) => {
                  const checked = selectedSourcePaths.includes(sourcePath);
                  return (
                    <label
                      key={sourcePath}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm",
                        checked && "border-primary bg-muted/40",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 border border-input accent-primary"
                        checked={checked}
                        onChange={() => toggleSourcePath(sourcePath)}
                      />
                      <span className="min-w-0 font-mono text-xs break-all">{sourcePath}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Target locale</p>
              <div className="space-y-2">
                {targetLocales.map((targetLocale) => (
                  <label
                    key={targetLocale}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="download-target-locale"
                      className="size-4 border border-input accent-primary"
                      checked={locale === targetLocale}
                      onChange={() => setLocale(targetLocale)}
                    />
                    <span>{targetLocale}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canDownload || isDownloading} onClick={handleDownload}>
            {isDownloading ? <Spinner className="size-4" /> : null}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
