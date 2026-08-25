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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

import { ProjectSectionTitle } from "../../_components/project-page-shell";
import { projectCatBehaviorMessages } from "./project-cat-behavior-settings.messages";

type CatBehavior = {
  automaticallyGroupIdenticalStrings: boolean;
  groupingRevision: number;
  canManage: boolean;
};

type Preview = { affectedOccurrences: number; groups: number };

export function ProjectCatBehaviorSettings({
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
  const [confirmation, setConfirmation] = useState<{
    nextValue: boolean;
    preview?: Preview;
  } | null>(null);
  const queryKey = ["project-cat-behavior", organizationSlug, projectId];
  const behaviorQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "cat-behavior"
      ].$get({ param: { organizationSlug, projectId } });
      if (!response.ok) throw new Error(intl.formatMessage(projectCatBehaviorMessages.loadError));
      return (await response.json()).catBehavior as CatBehavior;
    },
  });
  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "cat-behavior"
      ].preview.$get({ param: { organizationSlug, projectId } });
      if (!response.ok) throw new Error(intl.formatMessage(projectCatBehaviorMessages.loadError));
      return (await response.json()).preview as Preview;
    },
    onSuccess: (preview) => setConfirmation({ nextValue: true, preview }),
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(projectCatBehaviorMessages.loadError),
      ),
  });
  const updateMutation = useMutation({
    mutationFn: async (nextValue: boolean) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "cat-behavior"
      ].$patch({
        param: { organizationSlug, projectId },
        json: { automaticallyGroupIdenticalStrings: nextValue },
      });
      if (!response.ok) throw new Error(intl.formatMessage(projectCatBehaviorMessages.updateError));
      return (await response.json()).catBehavior as CatBehavior;
    },
    onSuccess: (catBehavior) => {
      queryClient.setQueryData(queryKey, catBehavior);
      setConfirmation(null);
      toast.success(intl.formatMessage(projectCatBehaviorMessages.saved));
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(projectCatBehaviorMessages.updateError),
      ),
  });
  const behavior = behaviorQuery.data;
  const pending = previewMutation.isPending || updateMutation.isPending;

  function requestChange(nextValue: boolean) {
    if (nextValue) previewMutation.mutate();
    else setConfirmation({ nextValue: false });
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
      <div>
        <ProjectSectionTitle>
          <FormattedMessage {...projectCatBehaviorMessages.title} />
        </ProjectSectionTitle>
        <TypographyP className="mt-1 text-sm text-muted-foreground">
          <FormattedMessage {...projectCatBehaviorMessages.description} />
        </TypographyP>
      </div>
      <div className="flex items-start justify-between gap-6 rounded-md border border-border bg-background p-4">
        <div className="min-w-0">
          <label htmlFor="automatic-identical-string-grouping" className="text-sm font-medium">
            <FormattedMessage {...projectCatBehaviorMessages.settingLabel} />
          </label>
          <TypographyP className="mt-1 max-w-2xl text-sm text-muted-foreground">
            <FormattedMessage {...projectCatBehaviorMessages.settingDescription} />
          </TypographyP>
          {!canManage ? (
            <TypographyP className="mt-2 text-xs text-muted-foreground">
              <FormattedMessage {...projectCatBehaviorMessages.managerOnly} />
            </TypographyP>
          ) : null}
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
                  ? projectCatBehaviorMessages.enableTitle
                  : projectCatBehaviorMessages.disableTitle)}
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.nextValue ? (
                <FormattedMessage
                  {...projectCatBehaviorMessages.enableDescription}
                  values={{
                    occurrences: confirmation.preview?.affectedOccurrences ?? 0,
                    groups: confirmation.preview?.groups ?? 0,
                  }}
                />
              ) : (
                <FormattedMessage {...projectCatBehaviorMessages.disableDescription} />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>
              <FormattedMessage {...projectCatBehaviorMessages.cancel} />
            </AlertDialogCancel>
            <Button
              disabled={updateMutation.isPending}
              onClick={() => confirmation && updateMutation.mutate(confirmation.nextValue)}
            >
              {updateMutation.isPending ? <Spinner /> : null}
              <FormattedMessage
                {...(confirmation?.nextValue
                  ? projectCatBehaviorMessages.confirmEnable
                  : projectCatBehaviorMessages.confirmDisable)}
              />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
