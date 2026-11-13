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
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SrxEditor } from "@/components/srx-editor/srx-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";
import {
  createStarterSrxDocument,
  parseSrxXml,
  serializeSrxXml,
  type SrxDocumentModel,
  validateSrxDocument,
} from "@/lib/i18n/srx/srx-document";
import { SRX_CUSTOM_XML_PLACEHOLDER } from "@/lib/i18n/srx/srx-template-samples";

import { projectFileSegmentationDialogMessages as messages } from "./project-file-segmentation-dialog.messages";

type SegmentationState = {
  enabled: boolean;
  useCustom: boolean;
  template: "default" | "html" | "markdown";
  customSrxModel: SrxDocumentModel;
  customXmlParseFailed: boolean;
  supportsSegmentation: boolean;
};

function resolveCustomSrxModel(xml: string | null | undefined): {
  model: SrxDocumentModel;
  parseFailed: boolean;
} {
  const source = xml?.trim() || SRX_CUSTOM_XML_PLACEHOLDER;
  const parsed = parseSrxXml(source);
  if (parsed.ok) {
    return { model: parsed.model, parseFailed: false };
  }
  const fallback = parseSrxXml(SRX_CUSTOM_XML_PLACEHOLDER);
  return {
    model: fallback.ok ? fallback.model : createStarterSrxDocument(),
    parseFailed: true,
  };
}

function segmentationApiPath(organizationSlug: string, projectId: string, sourcePath: string) {
  const params = new URLSearchParams({ sourcePath });
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/segmentation?${params}`;
}

function patchSegmentationPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/segmentation`;
}

export function ProjectFileSegmentationDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourcePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SegmentationState | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["project-file-segmentation", organizationSlug, projectId, sourcePath],
    enabled: open,
    queryFn: async () => {
      const response = await fetch(segmentationApiPath(organizationSlug, projectId, sourcePath));
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      }
      const body = (await response.json()) as {
        segmentation: {
          enabled: boolean;
          template: "default" | "html" | "markdown" | "custom";
          customSrxXml: string | null;
          supportsSegmentation: boolean;
        };
      };
      return body.segmentation;
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }
    const data = settingsQuery.data;
    const custom = resolveCustomSrxModel(data.customSrxXml);
    setForm({
      enabled: data.enabled,
      useCustom: data.template === "custom",
      template:
        data.template === "html" || data.template === "markdown" ? data.template : "default",
      customSrxModel: custom.model,
      customXmlParseFailed: custom.parseFailed,
      supportsSegmentation: data.supportsSegmentation,
    });
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error(intl.formatMessage(messages.loadFailed));
      }
      if (form.enabled && form.useCustom) {
        const issues = validateSrxDocument(form.customSrxModel);
        if (issues.length > 0) {
          throw new Error(
            intl.formatMessage(messages.validationFailed, {
              detail: issues[0].message,
            }),
          );
        }
      }
      const segmentation = {
        enabled: form.enabled && form.supportsSegmentation,
        template: form.enabled && form.useCustom ? "custom" : form.template,
        customSrxXml: form.enabled && form.useCustom ? serializeSrxXml(form.customSrxModel) : null,
      };
      const response = await fetch(patchSegmentationPath(organizationSlug, projectId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath, segmentation }),
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", organizationSlug, projectId] }),
        queryClient.invalidateQueries({
          queryKey: ["project-file-detail", organizationSlug, projectId, sourcePath],
        }),
        queryClient.invalidateQueries({
          queryKey: ["project-file-segmentation", organizationSlug, projectId, sourcePath],
        }),
      ]);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const isLoading = settingsQuery.isLoading || !form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !form.supportsSegmentation ? (
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.unsupportedFormat} />
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="segmentation-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((current) =>
                    current ? { ...current, enabled: checked === true } : current,
                  )
                }
              />
              <Label htmlFor="segmentation-enabled">
                <FormattedMessage {...messages.enableLabel} />
              </Label>
            </div>

            {form.enabled ? (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="segmentation-custom"
                    checked={form.useCustom}
                    onCheckedChange={(checked) =>
                      setForm((current) =>
                        current ? { ...current, useCustom: checked === true } : current,
                      )
                    }
                  />
                  <Label htmlFor="segmentation-custom">
                    <FormattedMessage {...messages.useCustomLabel} />
                  </Label>
                </div>

                {form.useCustom ? (
                  <div className="flex flex-col gap-3">
                    <Label>
                      <FormattedMessage {...messages.customRulesLabel} />
                    </Label>
                    {form.customXmlParseFailed ? (
                      <Alert variant="destructive">
                        <AlertDescription>
                          <FormattedMessage {...messages.customXmlParseFailed} />
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <SrxEditor
                      model={form.customSrxModel}
                      onChange={(customSrxModel) =>
                        setForm((current) =>
                          current
                            ? { ...current, customSrxModel, customXmlParseFailed: false }
                            : current,
                        )
                      }
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Label>
                      <FormattedMessage {...messages.templateLabel} />
                    </Label>
                    <Select
                      value={form.template}
                      onValueChange={(value) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                template: value as SegmentationState["template"],
                              }
                            : current,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">
                          <FormattedMessage {...messages.templateDefault} />
                        </SelectItem>
                        <SelectItem value="html">
                          <FormattedMessage {...messages.templateHtml} />
                        </SelectItem>
                        <SelectItem value="markdown">
                          <FormattedMessage {...messages.templateMarkdown} />
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            disabled={isLoading || !form?.supportsSegmentation || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Spinner className="size-4" /> : null}
            <FormattedMessage {...messages.save} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
