"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

const FILE_ACCEPT =
  ".json,.jsonc,.yaml,.yml,.arb,.xlf,.xlif,.xliff,.po,.html,.md,.mdx,.strings,.stringsdict,.xcstrings,.csv";

type ImportTranslationsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
};

function importApiPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/translations/import`;
}

export function ImportTranslationsDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourcePath,
  targetLocales,
}: ImportTranslationsDialogProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [locale, setLocale] = useState<string>(targetLocales[0] ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setLocale(targetLocales[0] ?? "");
      setSelectedFile(null);
    }
  }, [open, targetLocales]);

  const importTranslations = useMutation({
    mutationFn: async () => {
      if (!locale) {
        throw new Error("Select a target locale.");
      }
      if (!selectedFile) {
        throw new Error("Choose a translation file to import.");
      }
      if (!inferSupportedFileTranslationFileFormat(sourcePath)) {
        throw new Error("This file format is not supported for translation import.");
      }

      const formData = new FormData();
      formData.set("file", selectedFile);
      formData.set("sourcePath", sourcePath);
      formData.set("locale", locale);

      const response = await fetch(importApiPath(organizationSlug, projectId), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to import translations");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", organizationSlug, projectId] }),
        queryClient.invalidateQueries({
          queryKey: ["project-file-detail", organizationSlug, projectId, sourcePath],
        }),
      ]);
      toast.success("Import started — translations will appear once processing completes.");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to import translations");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import translations</DialogTitle>
          <DialogDescription>
            Upload an already-translated file for{" "}
            <span className="font-mono text-foreground">{sourcePath}</span>. Keys are matched to the
            source file and imported as approved.
          </DialogDescription>
        </DialogHeader>

        {targetLocales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add target locales in project settings before importing translations.
          </p>
        ) : (
          <div className="space-y-4">
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
                      name="import-target-locale"
                      className="size-4 border border-input accent-primary"
                      checked={locale === targetLocale}
                      onChange={() => setLocale(targetLocale)}
                    />
                    <span>{targetLocale}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Translation file</p>
              <input
                ref={inputRef}
                type="file"
                accept={FILE_ACCEPT}
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
                  disabled={importTranslations.isPending}
                >
                  Choose file
                </Button>
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {selectedFile ? selectedFile.name : "No file selected"}
                </span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              importTranslations.isPending || targetLocales.length === 0 || !locale || !selectedFile
            }
            onClick={() => importTranslations.mutate()}
          >
            {importTranslations.isPending ? <Spinner className="size-4" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
