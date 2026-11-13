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
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";
import { z } from "zod";

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
import { ApiResponseError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import {
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
} from "@/lib/i18n/locale-display-names.messages";

import {
  fetchTranslationAsSourceSends,
  translationAsSourceSendsQueryKey,
} from "./translation-as-source-sent-mark";
import { useTranslationAsSourceDialogMessages as messages } from "./use-translation-as-source-dialog.messages";

type TranslationSourceDestination = {
  id: string;
  name: string;
  sourceLocale: string;
  keepsApprovedOnSourceChange: boolean;
};

const notApprovedBodySchema = z.object({
  error: z.literal("translations_not_approved"),
  details: z.object({
    missingCount: z.number(),
    totalCount: z.number(),
    missingStrings: z.array(z.object({ key: z.string(), sourceText: z.string() })),
  }),
});

type NotApprovedDetails = z.infer<typeof notApprovedBodySchema>["details"];

/** The send was refused because some strings have no approved translation yet. */
class TranslationsNotApprovedError extends Error {
  readonly details: NotApprovedDetails;
  readonly locale: string;

  constructor(details: NotApprovedDetails, locale: string) {
    super("translations_not_approved");
    this.name = "TranslationsNotApprovedError";
    this.details = details;
    this.locale = locale;
  }
}

/** Refusals a person can reach from the dialog, by the route's error code. */
const REFUSAL_MESSAGES: Partial<Record<string, MessageDescriptor>> = {
  file_reads_differently: messages.readsDifferently,
  file_cannot_be_written: messages.cannotBeWritten,
  source_file_not_ready: messages.notReady,
  source_file_read_failed: messages.readFailed,
  no_strings: messages.noStrings,
  forbidden: messages.roleCannotSend,
  destination_file_replaced: messages.destinationChanged,
  destination_branch_protected: messages.destinationBranchProtected,
};

/** What the chosen project has at the path a send writes to, as the route describes it. */
type DestinationFile = {
  state: "empty" | "sent_from_here" | "from_sync" | "other";
  path: string;
  addedAt: string | null;
  versionId?: string;
  addedBy?: string | null;
  sentFrom?: { thisProject: boolean; projectName: string | null; sourcePath: string } | null;
};

/** Where the chosen project's file came from, for a file a send would replace. */
function describeDestinationFile(intl: IntlShape, file: DestinationFile, project: string): string {
  const values = {
    project,
    file: file.path,
    date: intl.formatDate(file.addedAt ?? undefined, { dateStyle: "medium", timeStyle: "short" }),
  };
  if (file.state === "from_sync") {
    return intl.formatMessage(messages.destinationFromSync, values);
  }
  if (file.sentFrom?.thisProject) {
    return intl.formatMessage(messages.destinationSentFromFile, {
      ...values,
      sourceFile: file.sentFrom.sourcePath,
    });
  }
  if (file.sentFrom) {
    return file.sentFrom.projectName
      ? intl.formatMessage(messages.destinationSentFromProject, {
          ...values,
          fromProject: file.sentFrom.projectName,
        })
      : intl.formatMessage(messages.destinationSentFromAnotherProject, values);
  }
  return file.addedBy
    ? intl.formatMessage(messages.destinationUploadedBy, { ...values, person: file.addedBy })
    : intl.formatMessage(messages.destinationAdded, values);
}

function translationSourceApi() {
  return apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files["translation-source"];
}

function destinationLabel(intl: IntlShape, destination: TranslationSourceDestination) {
  return intl.formatMessage(messages.projectOption, {
    project: destination.name,
    language: formatLocaleOptionLabel(intl, destination.sourceLocale),
  });
}

export function UseTranslationAsSourceDialog({
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
  const selectId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const destinationsQuery = useQuery({
    queryKey: ["project-translation-source-destinations", organizationSlug, projectId],
    enabled: open,
    queryFn: async () => {
      const fallback = intl.formatMessage(messages.loadFailed);
      try {
        const response = await translationSourceApi().destinations.$get({
          param: { organizationSlug, projectId },
        });
        if (response.status !== 200) {
          throw await readApiResponseError(response, fallback);
        }
        const body = await response.json();
        return body.destinations;
      } catch (error) {
        if (error instanceof ApiResponseError) {
          throw error;
        }
        throw new Error(fallback, { cause: error instanceof Error ? error : undefined });
      }
    },
  });

  // The same list the Files page marks its rows with; without it the dialog just says nothing.
  const sendsQuery = useQuery({
    queryKey: translationAsSourceSendsQueryKey(organizationSlug, projectId),
    enabled: open,
    queryFn: () => fetchTranslationAsSourceSends(organizationSlug, projectId),
  });

  const destinations = destinationsQuery.data ?? [];
  const destination =
    destinations.find((entry) => entry.id === selectedId) ?? destinations[0] ?? null;

  // What the chosen project has at that path, shown before sending; the server checks it again.
  const destinationFileQueryKey = [
    "project-translation-source-destination-file",
    organizationSlug,
    projectId,
    sourcePath,
    destination?.id ?? null,
  ];
  const destinationFileQuery = useQuery({
    queryKey: destinationFileQueryKey,
    enabled: open && destination !== null,
    staleTime: 0,
    queryFn: async (): Promise<DestinationFile | null> => {
      if (!destination) {
        return null;
      }
      const response = await translationSourceApi()["destination-file"].$get({
        param: { organizationSlug, projectId },
        query: { sourcePath, destinationProjectId: destination.id },
      });
      if (response.status !== 200) {
        throw await readApiResponseError(response, intl.formatMessage(messages.sendFailed));
      }
      return (await response.json()).destinationFile;
    },
  });
  // A failed re-read keeps the earlier data; the notice is built only from a current read.
  const destinationFile = destinationFileQuery.isSuccess ? destinationFileQuery.data : null;
  // A file this file did not send is replaced only once the person has seen what it is.
  const replacing =
    destinationFile?.state === "other" || destinationFile?.state === "from_sync"
      ? destinationFile
      : null;
  const noticeId = useId();
  const lastSend = destination
    ? sendsQuery.data?.get(sourcePath)?.find((send) => send.destinationProjectId === destination.id)
    : undefined;
  const loadErrorMessage =
    destinationsQuery.error instanceof Error
      ? destinationsQuery.error.message
      : intl.formatMessage(messages.loadFailed);

  const sendMutation = useMutation({
    mutationFn: async ({
      target,
      replaceVersionId,
    }: {
      target: TranslationSourceDestination;
      replaceVersionId?: string;
    }) => {
      const fallback = intl.formatMessage(messages.sendFailed);
      try {
        const response = await translationSourceApi().$post({
          param: { organizationSlug, projectId },
          json: { sourcePath, destinationProjectId: target.id, replaceVersionId },
        });
        if (response.status === 201) {
          return target;
        }
        if (response.status === 409) {
          const refusal = notApprovedBodySchema.safeParse(
            await response
              .clone()
              .json()
              .catch(() => null),
          );
          if (refusal.success) {
            throw new TranslationsNotApprovedError(refusal.data.details, target.sourceLocale);
          }
        }
        const failure = await readApiResponseError(response, fallback);
        const refusal = failure.code ? REFUSAL_MESSAGES[failure.code] : undefined;
        throw refusal ? new ApiResponseError(intl.formatMessage(refusal), failure) : failure;
      } catch (error) {
        if (error instanceof ApiResponseError || error instanceof TranslationsNotApprovedError) {
          throw error;
        }
        throw new Error(fallback, { cause: error instanceof Error ? error : undefined });
      }
    },
    // The chosen project's file is read again after any send, so the notice stays true.
    onSettled: () => queryClient.invalidateQueries({ queryKey: destinationFileQueryKey }),
    onSuccess: (target) => {
      void queryClient.invalidateQueries({
        queryKey: translationAsSourceSendsQueryKey(organizationSlug, projectId),
      });
      toast.success(intl.formatMessage(messages.sendSuccess, { project: target.name }));
      onOpenChange(false);
    },
  });

  const sendError = sendMutation.error;

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

        {destinationsQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {loadErrorMessage}
          </p>
        ) : destinationsQuery.data == null ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : destination === null ? (
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.noDestinations} />
          </p>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={selectId}>
              <FormattedMessage {...messages.projectLabel} />
            </Label>
            <Select
              value={destination.id}
              onValueChange={(value) => {
                setSelectedId(typeof value === "string" ? value : null);
                sendMutation.reset();
              }}
            >
              <SelectTrigger id={selectId} className="w-full min-w-0">
                <SelectValue className="min-w-0">
                  <span className="truncate" title={destinationLabel(intl, destination)}>
                    {destinationLabel(intl, destination)}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {destinations.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    <span className="whitespace-normal break-words">
                      {destinationLabel(intl, entry)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lastSend ? (
              <p className="text-sm text-muted-foreground">
                <FormattedMessage
                  {...(lastSend.changedSinceSent ? messages.lastSentChanged : messages.lastSent)}
                  values={{
                    date: intl.formatDate(lastSend.sentAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                    language: formatLocaleDisplayName(intl, lastSend.locale),
                  }}
                />
              </p>
            ) : null}
            {replacing ? (
              <p
                id={noticeId}
                className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
              >
                {describeDestinationFile(intl, replacing, destination.name)}{" "}
                <FormattedMessage {...messages.destinationReplaceConsequence} />
              </p>
            ) : destinationFileQuery.isError ? (
              <p className="text-sm text-destructive" role="alert">
                <FormattedMessage
                  {...messages.destinationFileLoadFailed}
                  values={{ project: destination.name }}
                />
              </p>
            ) : null}
            {destination.keepsApprovedOnSourceChange ? (
              <p className="text-sm text-muted-foreground">
                <FormattedMessage
                  {...messages.keepsApprovedNote}
                  values={{ project: destination.name }}
                />
              </p>
            ) : null}
            {sendError instanceof TranslationsNotApprovedError ? (
              <div className="flex flex-col gap-2" role="alert">
                <p className="text-sm text-destructive">
                  <FormattedMessage
                    {...messages.notApproved}
                    values={{
                      missingCount: sendError.details.missingCount,
                      totalCount: sendError.details.totalCount,
                      language: formatLocaleDisplayName(intl, sendError.locale),
                    }}
                  />
                </p>
                {sendError.details.missingStrings.length > 0 ? (
                  <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                    {sendError.details.missingStrings.map((missing) => (
                      <li key={missing.key} className="truncate" title={missing.sourceText}>
                        {missing.sourceText}
                      </li>
                    ))}
                    {sendError.details.missingCount > sendError.details.missingStrings.length ? (
                      <li className="text-muted-foreground">
                        <FormattedMessage
                          {...messages.moreMissing}
                          values={{
                            count:
                              sendError.details.missingCount -
                              sendError.details.missingStrings.length,
                          }}
                        />
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ) : sendError ? (
              <p className="text-sm text-destructive" role="alert">
                {sendError.message}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            className="min-w-0 shrink"
            aria-describedby={replacing ? noticeId : undefined}
            // Sent only on what the person sees now of the chosen project's file.
            disabled={
              destination === null ||
              sendMutation.isPending ||
              !destinationFileQuery.isSuccess ||
              destinationFileQuery.isFetching
            }
            onClick={() => {
              if (destination) {
                sendMutation.mutate({
                  target: destination,
                  replaceVersionId: replacing?.versionId,
                });
              }
            }}
          >
            {sendMutation.isPending ? <Spinner className="size-4" /> : null}
            <span className="min-w-0 truncate">
              {destination && replacing ? (
                <FormattedMessage {...messages.replaceIn} values={{ project: destination.name }} />
              ) : (
                <FormattedMessage {...messages.send} />
              )}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
