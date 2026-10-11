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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";
import {
  type MessageFormat,
  messageFormats,
  normalizeMessageFormat,
} from "@/lib/i18n/message-format";

import { projectFileMessageFormatDialogMessages as messages } from "./project-file-message-format-dialog.messages";

const FORMAT_LABELS: Record<MessageFormat, MessageDescriptor> = {
  auto: messages.formatAuto,
  icu: messages.formatIcu,
  i18next: messages.formatI18next,
};

const FORMAT_HINTS: Record<MessageFormat, MessageDescriptor> = {
  auto: messages.formatAutoHint,
  icu: messages.formatIcuHint,
  i18next: messages.formatI18nextHint,
};

function messageFormatApiPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/message-format`;
}

export function ProjectFileMessageFormatDialog({
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
  const [selected, setSelected] = useState<MessageFormat | null>(null);
  const queryKey = ["project-file-message-format", organizationSlug, projectId, sourcePath];

  const settingsQuery = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => {
      const params = new URLSearchParams({ sourcePath });
      const response = await fetch(
        `${messageFormatApiPath(organizationSlug, projectId)}?${params}`,
      );
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.loadFailed));
      }
      const body = (await response.json()) as { messageFormat: string };
      return normalizeMessageFormat(body.messageFormat);
    },
  });

  const messageFormat = selected ?? settingsQuery.data ?? null;

  const saveMutation = useMutation({
    mutationFn: async (value: MessageFormat) => {
      const response = await fetch(messageFormatApiPath(organizationSlug, projectId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath, messageFormat: value }),
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: ["project-file-detail", organizationSlug, projectId, sourcePath],
        }),
      ]);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>

        {messageFormat === null ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="message-format-select">
              <FormattedMessage {...messages.formatLabel} />
            </Label>
            <Select
              value={messageFormat}
              onValueChange={(value) => setSelected(normalizeMessageFormat(value))}
            >
              <SelectTrigger id="message-format-select">
                <SelectValue>
                  <FormattedMessage {...FORMAT_LABELS[messageFormat]} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {messageFormats.map((format) => (
                  <SelectItem key={format} value={format}>
                    <FormattedMessage {...FORMAT_LABELS[format]} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              <FormattedMessage {...FORMAT_HINTS[messageFormat]} />
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            disabled={messageFormat === null || saveMutation.isPending}
            onClick={() => {
              if (messageFormat) {
                saveMutation.mutate(messageFormat);
              }
            }}
          >
            {saveMutation.isPending ? <Spinner className="size-4" /> : null}
            <FormattedMessage {...messages.save} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
