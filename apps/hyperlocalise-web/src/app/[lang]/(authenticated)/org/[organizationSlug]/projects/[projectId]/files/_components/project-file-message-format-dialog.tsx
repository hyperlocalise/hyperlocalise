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
import { useId, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiResponseError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import {
  type MessageFormat,
  messageFormats,
  normalizeMessageFormat,
} from "@/lib/i18n/message-format";
import {
  extractCustomPlaceholderSpans,
  MAX_PLACEHOLDER_PATTERN_LENGTH,
  MAX_PLACEHOLDER_PATTERNS,
  normalizePlaceholderPatterns,
  type PlaceholderPatternError,
  validatePlaceholderPattern,
} from "@/lib/i18n/placeholder-patterns";

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

const PATTERN_ERROR_MESSAGES: Record<PlaceholderPatternError, MessageDescriptor> = {
  empty: messages.patternErrorInvalid,
  too_long: messages.patternErrorTooLong,
  invalid: messages.patternErrorInvalid,
  unsupported_syntax: messages.patternErrorUnsupported,
  matches_empty: messages.patternErrorMatchesEmpty,
};

type PlaceholderSettings = {
  messageFormat: MessageFormat;
  placeholderPatterns: string[];
};

function patternLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function messageFormatApi() {
  return apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files["message-format"];
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
  const [patternsDraft, setPatternsDraft] = useState<string | null>(null);
  const [sampleText, setSampleText] = useState("");
  const patternsFieldId = useId();
  const sampleFieldId = useId();
  const queryKey = ["project-file-message-format", organizationSlug, projectId, sourcePath];

  const settingsQuery = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => {
      const fallback = intl.formatMessage(messages.loadFailed);
      try {
        const response = await messageFormatApi().$get({
          param: { organizationSlug, projectId },
          query: { sourcePath },
        });
        if (response.status !== 200) {
          throw await readApiResponseError(response, fallback);
        }
        const body = await response.json();
        return {
          messageFormat: normalizeMessageFormat(body.messageFormat),
          placeholderPatterns: normalizePlaceholderPatterns(body.placeholderPatterns),
        } satisfies PlaceholderSettings;
      } catch (error) {
        if (error instanceof ApiResponseError) {
          throw error;
        }
        throw new Error(fallback, { cause: error instanceof Error ? error : undefined });
      }
    },
  });

  const messageFormat = selected ?? settingsQuery.data?.messageFormat ?? null;
  const patternsText = patternsDraft ?? settingsQuery.data?.placeholderPatterns.join("\n") ?? "";
  const placeholderPatterns = useMemo(() => patternLines(patternsText), [patternsText]);
  const patternErrors = useMemo(
    () =>
      placeholderPatterns.flatMap((pattern, index) => {
        const error = validatePlaceholderPattern(pattern);
        return error ? [{ line: index + 1, error }] : [];
      }),
    [placeholderPatterns],
  );
  const tooManyPatterns = placeholderPatterns.length > MAX_PLACEHOLDER_PATTERNS;
  const patternsInvalid = patternErrors.length > 0 || tooManyPatterns;
  const sampleMatches = useMemo(
    () =>
      patternsInvalid || !sampleText
        ? []
        : extractCustomPlaceholderSpans(sampleText, placeholderPatterns),
    [patternsInvalid, placeholderPatterns, sampleText],
  );
  const loadErrorMessage =
    settingsQuery.error instanceof Error
      ? settingsQuery.error.message
      : intl.formatMessage(messages.loadFailed);

  const saveMutation = useMutation({
    mutationFn: async (value: PlaceholderSettings) => {
      const response = await messageFormatApi().$patch({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          messageFormat: value.messageFormat,
          placeholderPatterns: value.placeholderPatterns,
        },
      });
      if (response.status !== 200) {
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

        {settingsQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {loadErrorMessage}
          </p>
        ) : messageFormat === null ? (
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

            <Label htmlFor={patternsFieldId} className="mt-4">
              <FormattedMessage {...messages.patternsLabel} />
            </Label>
            <Textarea
              id={patternsFieldId}
              value={patternsText}
              onChange={(event) => setPatternsDraft(event.target.value)}
              placeholder={intl.formatMessage(messages.patternsPlaceholder)}
              aria-invalid={patternsInvalid || undefined}
              aria-describedby={`${patternsFieldId}-hint`}
              className="max-h-48 font-mono text-sm"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              rows={3}
            />
            <p id={`${patternsFieldId}-hint`} className="text-sm text-muted-foreground">
              <FormattedMessage
                {...messages.patternsHint}
                values={{ max: MAX_PLACEHOLDER_PATTERNS }}
              />
            </p>
            {patternsInvalid ? (
              <ul className="flex flex-col gap-1 text-sm text-destructive" role="alert">
                {tooManyPatterns ? (
                  <li>
                    <FormattedMessage
                      {...messages.patternErrorTooMany}
                      values={{ max: MAX_PLACEHOLDER_PATTERNS }}
                    />
                  </li>
                ) : null}
                {patternErrors.map(({ line, error }) => (
                  <li key={line}>
                    <FormattedMessage
                      {...PATTERN_ERROR_MESSAGES[error]}
                      values={{ line, max: MAX_PLACEHOLDER_PATTERN_LENGTH }}
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            {placeholderPatterns.length > 0 && !patternsInvalid ? (
              <>
                <Label htmlFor={sampleFieldId} className="mt-2">
                  <FormattedMessage {...messages.sampleLabel} />
                </Label>
                <Input
                  id={sampleFieldId}
                  value={sampleText}
                  onChange={(event) => setSampleText(event.target.value)}
                  placeholder={intl.formatMessage(messages.samplePlaceholder)}
                  spellCheck={false}
                />
                {sampleText ? (
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {sampleMatches.length > 0 ? (
                      <FormattedMessage
                        {...messages.sampleMatches}
                        values={{
                          count: sampleMatches.length,
                          matches: sampleMatches.map((match) => match.literal).join(", "),
                        }}
                      />
                    ) : (
                      <FormattedMessage {...messages.sampleNoMatches} />
                    )}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          {settingsQuery.isError ? (
            <Button
              type="button"
              disabled={settingsQuery.isFetching}
              onClick={() => {
                void settingsQuery.refetch();
              }}
            >
              {settingsQuery.isFetching ? <Spinner className="size-4" /> : null}
              <FormattedMessage {...messages.retry} />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={messageFormat === null || patternsInvalid || saveMutation.isPending}
              onClick={() => {
                if (messageFormat) {
                  saveMutation.mutate({ messageFormat, placeholderPatterns });
                }
              }}
            >
              {saveMutation.isPending ? <Spinner className="size-4" /> : null}
              <FormattedMessage {...messages.save} />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
