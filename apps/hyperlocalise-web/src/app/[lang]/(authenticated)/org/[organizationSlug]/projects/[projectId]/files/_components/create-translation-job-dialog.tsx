"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
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
import { apiClient } from "@/lib/api-client-instance";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

type CreateTranslationJobDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord | null;
  sourceLocale: string;
  targetLocales: string[];
  onCreated?: (jobId: string) => void;
};

export function CreateTranslationJobDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  file,
  sourceLocale,
  targetLocales,
  onCreated,
}: CreateTranslationJobDialogProps) {
  const queryClient = useQueryClient();
  const [selectedLocales, setSelectedLocales] = useState<string[]>(targetLocales);

  const createJob = useMutation({
    mutationFn: async () => {
      if (!file?.storedFileId) {
        throw new Error("Upload a source file before creating a translation job.");
      }

      const fileFormat = inferSupportedFileTranslationFileFormat(file.sourcePath);
      if (!fileFormat) {
        throw new Error("This file format is not supported for translation jobs.");
      }

      if (selectedLocales.length === 0) {
        throw new Error("Select at least one target locale.");
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].jobs.$post({
        param: { organizationSlug, projectId },
        json: {
          type: "file",
          fileInput: {
            sourceFileId: file.storedFileId,
            fileFormat,
            sourceLocale,
            targetLocales: selectedLocales,
          },
        },
      });

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to create translation job");
      }

      const body = (await response.json()) as { job: { id: string } };
      return body.job.id;
    },
    onSuccess: async (jobId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", organizationSlug, projectId] }),
        queryClient.invalidateQueries({
          queryKey: ["project-overview-jobs", organizationSlug, projectId],
        }),
        queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] }),
      ]);
      toast.success("Translation agent is running");
      onCreated?.(jobId);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create translation job");
    },
  });

  function toggleLocale(locale: string) {
    setSelectedLocales((current) =>
      current.includes(locale)
        ? current.filter((entry) => entry !== locale)
        : [...current, locale].toSorted(),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Translate with agent</DialogTitle>
          <DialogDescription>
            Queue an AI translation agent for{" "}
            <span className="font-mono text-foreground">{file?.sourcePath ?? "this file"}</span>.
          </DialogDescription>
        </DialogHeader>

        {targetLocales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add target locales in project settings before creating translation jobs.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Source locale: <span className="font-medium text-foreground">{sourceLocale}</span>
            </p>
            <div className="space-y-2">
              {targetLocales.map((locale) => (
                <label
                  key={locale}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border border-input accent-primary"
                    checked={selectedLocales.includes(locale)}
                    onChange={() => toggleLocale(locale)}
                  />
                  <span>{locale}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={createJob.isPending || targetLocales.length === 0 || !file?.storedFileId}
            onClick={() => createJob.mutate()}
          >
            {createJob.isPending ? <Spinner className="size-4" /> : null}
            Translate with agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
