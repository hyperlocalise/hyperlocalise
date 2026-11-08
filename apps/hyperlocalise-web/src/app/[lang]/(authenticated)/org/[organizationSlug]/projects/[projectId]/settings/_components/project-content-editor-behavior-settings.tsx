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
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TypographyP } from "@/components/ui/typography";
import type { ApprovedTranslationsOnSourceChange } from "@/lib/go-svc/go-svc-client.types";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { projectContentEditorBehaviorMessages } from "./project-content-editor-behavior-settings.messages";
import { ProjectSettingsSectionHeading } from "./project-settings-section-heading";

type ContentEditorBehavior = {
  automaticallyGroupIdenticalStrings: boolean;
  groupingRevision: number;
  approvedTranslationsOnSourceChange: ApprovedTranslationsOnSourceChange;
  canManage: boolean;
};

type BehaviorChange =
  | { automaticallyGroupIdenticalStrings: boolean }
  | { approvedTranslationsOnSourceChange: ApprovedTranslationsOnSourceChange };

type Preview = { affectedOccurrences: number; groups: number };

export function ProjectContentEditorBehaviorSettings({
  organizationSlug,
  projectId,
  canManage,
}: {
  organizationSlug: string;
  projectId: string;
  canManage: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const [confirmation, setConfirmation] = useState<{
    nextValue: boolean;
    preview?: Preview;
  } | null>(null);
  const queryKey = ["project-content-editor-behavior", organizationSlug, projectId];
  const behaviorQuery = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const body = await goSvcClient.project.contentEditorBehavior(organizationSlug, projectId);
        return body.contentEditorBehavior as ContentEditorBehavior;
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(projectContentEditorBehaviorMessages.loadError),
          ),
          { cause: error },
        );
      }
    },
  });
  const previewMutation = useMutation({
    mutationFn: async () => {
      try {
        const body = await goSvcClient.project.previewContentEditorBehavior(
          organizationSlug,
          projectId,
        );
        return body.preview as Preview;
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(projectContentEditorBehaviorMessages.loadError),
          ),
          { cause: error },
        );
      }
    },
    onSuccess: (preview) => setConfirmation({ nextValue: true, preview }),
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(projectContentEditorBehaviorMessages.loadError),
      ),
  });
  const updateMutation = useMutation({
    mutationFn: async (change: BehaviorChange) => {
      try {
        const body = await goSvcClient.project.updateContentEditorBehavior(
          organizationSlug,
          projectId,
          change,
        );
        return body.contentEditorBehavior as ContentEditorBehavior;
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(projectContentEditorBehaviorMessages.updateError),
          ),
          { cause: error },
        );
      }
    },
    onSuccess: (contentEditorBehavior) => {
      queryClient.setQueryData(queryKey, contentEditorBehavior);
      setConfirmation(null);
      toast.success(intl.formatMessage(projectContentEditorBehaviorMessages.saved));
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(projectContentEditorBehaviorMessages.updateError),
      ),
  });
  const behavior = behaviorQuery.data;
  const pending = previewMutation.isPending || updateMutation.isPending;
  const sourceChangeOptions = [
    {
      value: "stay_approved",
      label: intl.formatMessage(projectContentEditorBehaviorMessages.sourceChangeStayApproved),
    },
    {
      value: "needs_review",
      label: intl.formatMessage(projectContentEditorBehaviorMessages.sourceChangeNeedsReview),
    },
  ] satisfies { value: ApprovedTranslationsOnSourceChange; label: string }[];
  // No value until loaded, so a failed load does not show the default as the saved choice.
  const sourceChange = behavior?.approvedTranslationsOnSourceChange ?? null;

  function requestChange(nextValue: boolean) {
    if (nextValue) previewMutation.mutate();
    else setConfirmation({ nextValue: false });
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
      <ProjectSettingsSectionHeading
        icon={PencilSimpleIcon}
        tone="grove"
        title={<FormattedMessage {...projectContentEditorBehaviorMessages.title} />}
        description={<FormattedMessage {...projectContentEditorBehaviorMessages.description} />}
      />
      <div className="flex items-start justify-between gap-6 rounded-md border border-border bg-background p-4">
        <div className="min-w-0">
          <label htmlFor="automatic-identical-string-grouping" className="text-sm font-medium">
            <FormattedMessage {...projectContentEditorBehaviorMessages.settingLabel} />
          </label>
          <TypographyP className="mt-1 max-w-2xl" size="small" tone="subtle">
            <FormattedMessage {...projectContentEditorBehaviorMessages.settingDescription} />
          </TypographyP>
        </div>
        {behaviorQuery.isLoading ? (
          <Spinner />
        ) : (
          <Switch
            id="automatic-identical-string-grouping"
            checked={behavior?.automaticallyGroupIdenticalStrings ?? false}
            disabled={!canManage || pending || behaviorQuery.isError}
            onCheckedChange={requestChange}
          />
        )}
      </div>
      <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <label htmlFor="approved-translations-on-source-change" className="text-sm font-medium">
            <FormattedMessage {...projectContentEditorBehaviorMessages.sourceChangeLabel} />
          </label>
          <TypographyP className="mt-1 max-w-2xl" size="small" tone="subtle">
            <FormattedMessage {...projectContentEditorBehaviorMessages.sourceChangeDescription} />
          </TypographyP>
        </div>
        {behaviorQuery.isLoading ? (
          <Spinner />
        ) : (
          <Select
            value={sourceChange}
            items={sourceChangeOptions}
            disabled={!canManage || pending || behaviorQuery.isError}
            onValueChange={(next) => {
              if (next && next !== sourceChange) {
                updateMutation.mutate({ approvedTranslationsOnSourceChange: next });
              }
            }}
          >
            <SelectTrigger
              id="approved-translations-on-source-change"
              className="h-9 w-full shrink-0 sm:w-44"
            >
              <SelectValue>
                {sourceChangeOptions.find((option) => option.value === sourceChange)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sourceChangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} label={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {!canManage ? (
        <TypographyP size="xsmall" tone="subtle">
          <FormattedMessage {...projectContentEditorBehaviorMessages.managerOnly} />
        </TypographyP>
      ) : null}
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !updateMutation.isPending) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage
                {...(confirmation?.nextValue
                  ? projectContentEditorBehaviorMessages.enableTitle
                  : projectContentEditorBehaviorMessages.disableTitle)}
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.nextValue ? (
                <FormattedMessage
                  {...projectContentEditorBehaviorMessages.enableDescription}
                  values={{
                    occurrences: confirmation.preview?.affectedOccurrences ?? 0,
                    groups: confirmation.preview?.groups ?? 0,
                  }}
                />
              ) : (
                <FormattedMessage {...projectContentEditorBehaviorMessages.disableDescription} />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>
              <FormattedMessage {...projectContentEditorBehaviorMessages.cancel} />
            </AlertDialogCancel>
            <Button
              disabled={updateMutation.isPending}
              onClick={() =>
                confirmation &&
                updateMutation.mutate({
                  automaticallyGroupIdenticalStrings: confirmation.nextValue,
                })
              }
            >
              {updateMutation.isPending ? <Spinner /> : null}
              <FormattedMessage
                {...(confirmation?.nextValue
                  ? projectContentEditorBehaviorMessages.confirmEnable
                  : projectContentEditorBehaviorMessages.confirmDisable)}
              />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
