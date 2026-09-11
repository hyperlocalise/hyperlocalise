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
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { observer } from "mobx-react-lite";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";

import { HyperlabExperimentQueryBridge } from "../store/hyperlab-query-bridge";
import {
  HyperlabWorkspaceProvider,
  useHyperlabWorkspace,
} from "../store/hyperlab-workspace-context";
import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabAllocation,
  type HyperlabAssignment,
  type HyperlabExperiment,
  type HyperlabFlag,
  type HyperlabVariant,
} from "./hyperlab-api";
import { HyperlabAudienceSelector } from "./hyperlab-audience-selector";
import { HyperlabPageShell } from "./hyperlab-page-shell";
import { HyperlabRolloutControl } from "./hyperlab-rollout-control";
import { equalVariantRollouts, rolloutToPercent, timezoneSelectItems } from "./hyperlab-schedule";
import { HyperlabStatusBadge } from "./hyperlab-status-badge";
import { HyperlabLoadError } from "./hyperlab-ui";

type ExperimentDetail = {
  experiment: HyperlabExperiment;
  variants: HyperlabVariant[];
  allocations: HyperlabAllocation[];
};

const EMPTY_VARIANTS: HyperlabVariant[] = [];
const EMPTY_FLAGS: HyperlabFlag[] = [];

export function HyperlabExperimentDetail({
  organizationSlug,
  experimentId,
  canWrite,
}: {
  organizationSlug: string;
  experimentId: string;
  canWrite: boolean;
}) {
  return (
    <HyperlabWorkspaceProvider>
      <HyperlabExperimentDetailConnected
        organizationSlug={organizationSlug}
        experimentId={experimentId}
        canWrite={canWrite}
      />
    </HyperlabWorkspaceProvider>
  );
}

const HyperlabExperimentDetailConnected = observer(function HyperlabExperimentDetailConnected({
  organizationSlug,
  experimentId,
  canWrite,
}: {
  organizationSlug: string;
  experimentId: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const { experiment: experimentStore, ui: uiStore } = useHyperlabWorkspace();

  const detailQuery = useQuery({
    queryKey: hyperlabQueryKeys.experiment(organizationSlug, experimentId),
    queryFn: async () => {
      const response = await client.experiments[":experimentId"].$get({
        param: { organizationSlug, experimentId },
      });
      return readHyperlabJson<ExperimentDetail>(response, intl.formatMessage(messages.loadError));
    },
  });
  const flagsQuery = useQuery({
    queryKey: hyperlabQueryKeys.flags(organizationSlug),
    queryFn: async () => {
      const response = await client.flags.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ flags: HyperlabFlag[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.flags;
    },
  });
  const assignmentsQuery = useQuery({
    queryKey: hyperlabQueryKeys.assignments(organizationSlug),
    queryFn: async () => {
      const response = await client.assignments.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ assignments: HyperlabAssignment[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.assignments;
    },
  });

  const experiment = detailQuery.data?.experiment;
  const variants = detailQuery.data?.variants ?? EMPTY_VARIANTS;

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: hyperlabQueryKeys.experiment(organizationSlug, experimentId),
    });
    await queryClient.invalidateQueries({
      queryKey: hyperlabQueryKeys.assignments(organizationSlug),
    });
    await queryClient.invalidateQueries({ queryKey: hyperlabQueryKeys.flags(organizationSlug) });
  }

  const saveDetails = useMutation({
    mutationFn: async () => {
      if (!experimentStore.startWall.iso || !experimentStore.endWall.iso) {
        throw new Error(intl.formatMessage(messages.scheduleNonexistent));
      }
      const response = await client.experiments[":experimentId"].$put({
        param: { organizationSlug, experimentId },
        json: {
          name: experimentStore.name,
          timezone: experimentStore.timezone,
          startAt: experimentStore.startWall.iso,
          endAt: experimentStore.endWall.iso,
        },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      experimentStore.markDetailsSaved();
      toast.success(intl.formatMessage(messages.saveSuccess));
      await refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const saveRollout = useMutation({
    mutationFn: async () => {
      const response = await client.experiments[":experimentId"].$put({
        param: { organizationSlug, experimentId },
        json: {
          audienceId: experimentStore.audienceId || null,
          rolloutPercentage: experimentStore.rolloutPercentage,
        },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      experimentStore.markRolloutSaved();
      toast.success(intl.formatMessage(messages.saveSuccess));
      await refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const saveSplits = useMutation({
    mutationFn: async () => {
      if (experimentStore.splitTotal !== 10000) {
        throw new Error(intl.formatMessage(messages.variantSplitWarning));
      }
      const response = await client.experiments[":experimentId"].rollouts.$put({
        param: { organizationSlug, experimentId },
        json: {
          rollouts: variants.map((variant) => ({
            variantId: variant.id,
            rolloutPercentage:
              experimentStore.variantSplits[variant.id] ?? variant.rolloutPercentage,
          })),
        },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      experimentStore.markSplitsSaved();
      toast.success(intl.formatMessage(messages.saveSuccess));
      await refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const changeStatus = useMutation({
    mutationFn: async (status: HyperlabExperiment["status"]) => {
      const response = await client.experiments[":experimentId"].$put({
        param: { organizationSlug, experimentId },
        json: { status },
      });
      return readHyperlabJson<{ experiment?: { status: HyperlabExperiment["status"] } }>(
        response,
        intl.formatMessage(messages.loadError),
      );
    },
    onSuccess: async (_body, status) => {
      toast.success(
        intl.formatMessage(messages.statusUpdated, {
          status: intl.formatMessage(
            status === "active"
              ? messages.statusActive
              : status === "archived"
                ? messages.statusArchived
                : messages.statusDraft,
          ),
        }),
      );
      await refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const addVariant = useMutation({
    mutationFn: async () => {
      const shares = equalVariantRollouts(variants.length + 1);
      const response = await client.experiments[":experimentId"].variants.$post({
        param: { organizationSlug, experimentId },
        json: {
          key: uiStore.variantKey,
          isControl: variants.length === 0,
          rolloutPercentage: shares[shares.length - 1] ?? 10000,
          siblingRollouts: variants.map((variant, index) => ({
            variantId: variant.id,
            rolloutPercentage: shares[index] ?? 0,
          })),
        },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.createSuccess));
      uiStore.resetAddVariantDialog();
      await refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const deleteExperiment = useMutation({
    mutationFn: async () => {
      const response = await client.experiments[":experimentId"].$delete({
        param: { organizationSlug, experimentId },
      });
      if (!response.ok) {
        await readHyperlabJson(response, intl.formatMessage(messages.loadError));
      }
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(messages.deleteSuccess));
      router.push(`/org/${organizationSlug}/hyperlab/experiments`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const statusItems = [
    { value: "draft", label: intl.formatMessage(messages.statusDraft) },
    { value: "active", label: intl.formatMessage(messages.statusActive) },
    { value: "archived", label: intl.formatMessage(messages.statusArchived) },
  ];
  const timezoneItems = timezoneSelectItems(experimentStore.timezone);
  const flags = flagsQuery.data ?? EMPTY_FLAGS;
  const assignmentsByVariant = useMemo(() => {
    const map = new Map<string, HyperlabAssignment[]>();
    for (const assignment of assignmentsQuery.data ?? []) {
      const list = map.get(assignment.variantId) ?? [];
      list.push(assignment);
      map.set(assignment.variantId, list);
    }
    return map;
  }, [assignmentsQuery.data]);

  return (
    <>
      <HyperlabExperimentQueryBridge snapshot={detailQuery.data} />
      <HyperlabPageShell
        title={experiment?.name ?? intl.formatMessage(messages.experimentsTitle)}
        description={intl.formatMessage(messages.experimentsDescription)}
        backHref={`/org/${organizationSlug}/hyperlab/experiments`}
        actions={
          experiment && canWrite ? (
            <Row spacing="1u" alignY="center">
              {experiment ? (
                <HyperlabStatusBadge status={experiment.status} endAt={experiment.endAt} />
              ) : null}
              <Select
                value={experiment.status}
                items={statusItems}
                onValueChange={(next) => {
                  if (next === "draft" || next === "active" || next === "archived") {
                    changeStatus.mutate(next);
                  }
                }}
              >
                <SelectTrigger
                  className="w-36"
                  aria-label={intl.formatMessage(messages.experimentStatusLabel)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {experiment.status !== "active" ? (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="destructive" />}>
                    <FormattedMessage {...messages.delete} />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        <FormattedMessage {...messages.deleteExperimentTitle} />
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        <FormattedMessage
                          {...messages.deleteExperimentBody}
                          values={{ name: experiment.name }}
                        />
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        <FormattedMessage {...messages.cancel} />
                      </AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => deleteExperiment.mutate()}
                        disabled={deleteExperiment.isPending}
                      >
                        <FormattedMessage {...messages.deleteExperiment} />
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </Row>
          ) : experiment ? (
            <HyperlabStatusBadge status={experiment.status} endAt={experiment.endAt} />
          ) : null
        }
      >
        <Rows spacing="2u">
          {detailQuery.isError ? (
            <HyperlabLoadError
              error={detailQuery.error}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : null}
          {experiment ? (
            <>
              <Card className={experimentStore.detailsDirty ? "ring-foreground/40" : undefined}>
                <CardHeader>
                  <CardTitle>
                    <FormattedMessage {...messages.detailsCardTitle} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="hyperlab-experiment-name">
                        <FormattedMessage {...messages.experimentNameLabel} />
                      </FieldLabel>
                      <Input
                        id="hyperlab-experiment-name"
                        value={experimentStore.name}
                        onChange={(event) => experimentStore.setName(event.target.value)}
                        disabled={!canWrite}
                      />
                    </Field>
                    <Columns spacing="1.5u" collapseBelow="small">
                      <Column width="1/3">
                        <Field>
                          <FieldLabel htmlFor="hyperlab-start-date">
                            <FormattedMessage {...messages.startDateLabel} />
                          </FieldLabel>
                          <Input
                            id="hyperlab-start-date"
                            type="date"
                            value={experimentStore.startDate}
                            onChange={(event) => experimentStore.setStartDate(event.target.value)}
                            disabled={!canWrite}
                          />
                        </Field>
                      </Column>
                      <Column width="1/3">
                        <Field>
                          <FieldLabel htmlFor="hyperlab-start-time">
                            <FormattedMessage {...messages.startTimeLabel} />
                          </FieldLabel>
                          <Input
                            id="hyperlab-start-time"
                            type="time"
                            value={experimentStore.startTime}
                            onChange={(event) => experimentStore.setStartTime(event.target.value)}
                            disabled={!canWrite}
                          />
                          {experimentStore.startWall.status === "nonexistent" ||
                          experimentStore.startWall.status === "invalid" ? (
                            <FieldDescription>
                              <FormattedMessage {...messages.scheduleNonexistent} />
                            </FieldDescription>
                          ) : null}
                          {experimentStore.startWall.status === "ambiguous" ? (
                            <FieldDescription>
                              <FormattedMessage {...messages.scheduleAmbiguous} />
                            </FieldDescription>
                          ) : null}
                        </Field>
                      </Column>
                      <Column width="1/3">
                        <Field>
                          <FieldLabel>
                            <FormattedMessage {...messages.timezoneLabel} />
                          </FieldLabel>
                          <Select
                            value={experimentStore.timezone}
                            items={timezoneItems}
                            onValueChange={(next) => {
                              if (next) {
                                experimentStore.setTimezone(next);
                              }
                            }}
                            disabled={!canWrite}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {timezoneItems.map((item) => (
                                  <SelectItem
                                    key={item.value}
                                    value={item.value}
                                    label={item.label}
                                  >
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      </Column>
                    </Columns>
                    <Columns spacing="1.5u" collapseBelow="small">
                      <Column width="1/3">
                        <Field>
                          <FieldLabel htmlFor="hyperlab-end-date">
                            <FormattedMessage {...messages.endDateLabel} />
                          </FieldLabel>
                          <Input
                            id="hyperlab-end-date"
                            type="date"
                            value={experimentStore.endDate}
                            onChange={(event) => experimentStore.setEndDate(event.target.value)}
                            disabled={!canWrite}
                          />
                        </Field>
                      </Column>
                      <Column width="1/3">
                        <Field>
                          <FieldLabel htmlFor="hyperlab-end-time">
                            <FormattedMessage {...messages.endTimeLabel} />
                          </FieldLabel>
                          <Input
                            id="hyperlab-end-time"
                            type="time"
                            value={experimentStore.endTime}
                            onChange={(event) => experimentStore.setEndTime(event.target.value)}
                            disabled={!canWrite}
                          />
                          {experimentStore.endWall.status === "nonexistent" ||
                          experimentStore.endWall.status === "invalid" ? (
                            <FieldDescription>
                              <FormattedMessage {...messages.scheduleNonexistent} />
                            </FieldDescription>
                          ) : null}
                          {experimentStore.endWall.status === "ambiguous" ? (
                            <FieldDescription>
                              <FormattedMessage {...messages.scheduleAmbiguous} />
                            </FieldDescription>
                          ) : null}
                        </Field>
                      </Column>
                    </Columns>
                  </FieldGroup>
                </CardContent>
                {canWrite ? (
                  <CardFooter className="gap-3">
                    <Button
                      type="button"
                      onClick={() => saveDetails.mutate()}
                      disabled={
                        saveDetails.isPending ||
                        !experimentStore.detailsDirty ||
                        !experimentStore.scheduleReady
                      }
                    >
                      {saveDetails.isPending ? <Spinner data-icon="inline-start" /> : null}
                      <FormattedMessage
                        {...(saveDetails.isPending ? messages.saving : messages.save)}
                      />
                    </Button>
                    {experimentStore.detailsDirty ? (
                      <TypographyP size="small" tone="subtle">
                        <FormattedMessage {...messages.unsavedChanges} />
                      </TypographyP>
                    ) : null}
                  </CardFooter>
                ) : null}
              </Card>

              <Card className={experimentStore.rolloutDirty ? "ring-foreground/40" : undefined}>
                <CardHeader>
                  <CardTitle>
                    <FormattedMessage {...messages.rolloutCardTitle} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Rows spacing="2u">
                    <HyperlabAudienceSelector
                      organizationSlug={organizationSlug}
                      value={experimentStore.audienceId}
                      onChange={(value) => experimentStore.setAudienceId(value)}
                      disabled={!canWrite}
                      hint={intl.formatMessage(messages.audienceRolloutHint)}
                    />
                    <HyperlabRolloutControl
                      id="hyperlab-experiment-rollout"
                      value={experimentStore.rolloutPercentage}
                      onChange={(value) => experimentStore.setRolloutPercentage(value)}
                      disabled={!canWrite}
                    />
                    <TypographyP size="small" tone="subtle">
                      <FormattedMessage {...messages.rolloutHint} />
                    </TypographyP>
                  </Rows>
                </CardContent>
                {canWrite ? (
                  <CardFooter className="gap-3">
                    <Button
                      type="button"
                      onClick={() => saveRollout.mutate()}
                      disabled={saveRollout.isPending || !experimentStore.rolloutDirty}
                    >
                      {saveRollout.isPending ? <Spinner data-icon="inline-start" /> : null}
                      <FormattedMessage
                        {...(saveRollout.isPending ? messages.saving : messages.saveRollout)}
                      />
                    </Button>
                    {experimentStore.rolloutDirty ? (
                      <TypographyP size="small" tone="subtle">
                        <FormattedMessage {...messages.unsavedChanges} />
                      </TypographyP>
                    ) : null}
                  </CardFooter>
                ) : null}
              </Card>

              {experiment.kind === "ab" && variants.length > 0 ? (
                <Card className={experimentStore.splitDirty ? "ring-foreground/40" : undefined}>
                  <CardHeader>
                    <CardTitle>
                      <FormattedMessage {...messages.variantSplitTitle} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Rows spacing="2u">
                      {variants.map((variant) => (
                        <HyperlabRolloutControl
                          key={variant.id}
                          id={`hyperlab-variant-split-${variant.id}`}
                          value={
                            experimentStore.variantSplits[variant.id] ?? variant.rolloutPercentage
                          }
                          onChange={(next) => experimentStore.setVariantSplit(variant.id, next)}
                          disabled={!canWrite}
                          label={
                            variant.isControl ? intl.formatMessage(messages.control) : variant.key
                          }
                        />
                      ))}
                      <TypographyP
                        size="small"
                        tone={experimentStore.splitTotal === 10000 ? "subtle" : "critical"}
                      >
                        <FormattedMessage
                          {...(experimentStore.splitTotal === 10000
                            ? messages.variantSplitTotal
                            : messages.variantSplitWarning)}
                          values={{ value: rolloutToPercent(experimentStore.splitTotal) }}
                        />
                      </TypographyP>
                      <TypographyP size="small" tone="subtle">
                        <FormattedMessage {...messages.variantRolloutHint} />
                      </TypographyP>
                    </Rows>
                  </CardContent>
                  {canWrite ? (
                    <CardFooter>
                      <Button
                        type="button"
                        onClick={() => saveSplits.mutate()}
                        disabled={
                          saveSplits.isPending ||
                          !experimentStore.splitDirty ||
                          experimentStore.splitTotal !== 10000
                        }
                      >
                        {saveSplits.isPending ? <Spinner data-icon="inline-start" /> : null}
                        <FormattedMessage
                          {...(saveSplits.isPending ? messages.saving : messages.saveVariantSplits)}
                        />
                      </Button>
                    </CardFooter>
                  ) : null}
                </Card>
              ) : null}

              <Rows spacing="1.5u">
                <Row spacing="1.5u" align="spaceBetween" alignY="center">
                  <TypographyP weight="medium">
                    <FormattedMessage {...messages.variantsTitle} />
                  </TypographyP>
                  {canWrite && experiment.kind === "ab" ? (
                    <Dialog
                      open={uiStore.addVariantOpen}
                      onOpenChange={(open) => uiStore.setAddVariantOpen(open)}
                    >
                      <DialogTrigger render={<Button variant="secondary" />}>
                        <HugeiconsIcon
                          icon={Add01Icon}
                          strokeWidth={1.8}
                          data-icon="inline-start"
                        />
                        <FormattedMessage {...messages.addVariant} />
                      </DialogTrigger>
                      <DialogContent>
                        <form
                          className="flex flex-col gap-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            addVariant.mutate();
                          }}
                        >
                          <DialogHeader>
                            <DialogTitle>
                              <FormattedMessage {...messages.addVariantTitle} />
                            </DialogTitle>
                            <DialogDescription>
                              <FormattedMessage {...messages.addVariantDescription} />
                            </DialogDescription>
                          </DialogHeader>
                          <Field>
                            <FieldLabel htmlFor="hyperlab-new-variant-key">
                              <FormattedMessage {...messages.variantKeyLabel} />
                            </FieldLabel>
                            <Input
                              id="hyperlab-new-variant-key"
                              value={uiStore.variantKey}
                              onChange={(event) => uiStore.setVariantKey(event.target.value)}
                              placeholder={intl.formatMessage(messages.variantKeyPlaceholder)}
                              required
                            />
                          </Field>
                          <DialogFooter>
                            <Button
                              type="submit"
                              disabled={!uiStore.variantKey.trim() || addVariant.isPending}
                            >
                              {addVariant.isPending ? <Spinner data-icon="inline-start" /> : null}
                              <FormattedMessage {...messages.addVariant} />
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </Row>
                {variants.length === 0 ? (
                  <TypographyP size="small" tone="subtle">
                    <FormattedMessage {...messages.noVariants} />
                  </TypographyP>
                ) : (
                  variants.map((variant) => (
                    <HyperlabVariantCard
                      key={variant.id}
                      organizationSlug={organizationSlug}
                      experiment={experiment}
                      variant={variant}
                      flags={flags}
                      assignments={assignmentsByVariant.get(variant.id) ?? []}
                      canWrite={canWrite}
                      canDeleteVariant={experiment.kind === "ab" && variants.length > 1}
                      onRefresh={refresh}
                    />
                  ))
                )}
              </Rows>
            </>
          ) : null}
        </Rows>
      </HyperlabPageShell>
    </>
  );
});

const HyperlabVariantCard = observer(function HyperlabVariantCard({
  organizationSlug,
  experiment,
  variant,
  flags,
  assignments,
  canWrite,
  canDeleteVariant,
  onRefresh,
}: {
  organizationSlug: string;
  experiment: HyperlabExperiment;
  variant: HyperlabVariant;
  flags: HyperlabFlag[];
  assignments: HyperlabAssignment[];
  canWrite: boolean;
  canDeleteVariant: boolean;
  onRefresh: () => Promise<void>;
}) {
  const intl = useIntl();
  const client = hyperlabClient();
  const { ui: uiStore } = useHyperlabWorkspace();
  const audienceId = uiStore.getVariantAudienceDraft(variant.id, variant.audienceId ?? "");
  const sheetOpen = uiStore.isVariantSheetOpen(variant.id);
  const flagsById = new Map(flags.map((flag) => [flag.id, flag]));

  const saveAudience = useMutation({
    mutationFn: async () => {
      const response = await client.variants[":variantId"].$put({
        param: { organizationSlug, variantId: variant.id },
        json: { audienceId: audienceId || null },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      await onRefresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const toggleAssignment = useMutation({
    mutationFn: async ({ assignmentId, enabled }: { assignmentId: string; enabled: boolean }) => {
      const response = await client.assignments[":assignmentId"].$put({
        param: { organizationSlug, assignmentId },
        json: { enabled },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      await onRefresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await client.assignments[":assignmentId"].$delete({
        param: { organizationSlug, assignmentId },
      });
      if (!response.ok) {
        await readHyperlabJson(response, intl.formatMessage(messages.loadError));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      await onRefresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const deleteVariant = useMutation({
    mutationFn: async () => {
      if (!canDeleteVariant) {
        throw new Error(intl.formatMessage(messages.cannotDeleteOnlyVariant));
      }
      const response = await client.variants[":variantId"].$delete({
        param: { organizationSlug, variantId: variant.id },
      });
      if (!response.ok) {
        await readHyperlabJson(response, intl.formatMessage(messages.loadError));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.deleteSuccess));
      await onRefresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  return (
    <Card>
      <CardHeader>
        <Row spacing="1.5u" align="spaceBetween" alignY="center">
          <Row spacing="1u" alignY="center">
            <CardTitle>
              {variant.isControl ? intl.formatMessage(messages.control) : variant.key}
            </CardTitle>
            <TypographyP size="small" tone="subtle">
              <FormattedMessage
                {...messages.allocation}
                values={{ percent: rolloutToPercent(variant.rolloutPercentage) }}
              />
            </TypographyP>
          </Row>
          {canWrite && canDeleteVariant ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} data-icon="inline-start" />
                <FormattedMessage {...messages.deleteVariant} />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    <FormattedMessage {...messages.deleteVariantConfirmTitle} />
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    <FormattedMessage
                      {...messages.deleteVariantConfirmBody}
                      values={{ name: variant.key }}
                    />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    <FormattedMessage {...messages.cancel} />
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => deleteVariant.mutate()}
                    disabled={deleteVariant.isPending}
                  >
                    <FormattedMessage {...messages.deleteVariant} />
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </Row>
      </CardHeader>
      <CardContent>
        <Rows spacing="2u">
          {experiment.audienceId ? null : (
            <Rows spacing="1.5u">
              <HyperlabAudienceSelector
                organizationSlug={organizationSlug}
                value={audienceId}
                onChange={(value) => uiStore.setVariantAudienceDraft(variant.id, value)}
                disabled={!canWrite}
                hint={intl.formatMessage(messages.variantAudienceHint)}
              />
              {canWrite && audienceId !== (variant.audienceId ?? "") ? (
                <Button
                  type="button"
                  size="sm"
                  className="w-fit"
                  onClick={() => saveAudience.mutate()}
                  disabled={saveAudience.isPending}
                >
                  <FormattedMessage {...messages.save} />
                </Button>
              ) : null}
            </Rows>
          )}
          <Rows spacing="1.5u">
            <Row spacing="1.5u" align="spaceBetween" alignY="center">
              <TypographyP size="small" weight="medium">
                <FormattedMessage {...messages.variantFlagsTitle} />
              </TypographyP>
              {canWrite ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => uiStore.setVariantSheetOpen(variant.id, true)}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} data-icon="inline-start" />
                  <FormattedMessage {...messages.attachFlag} />
                </Button>
              ) : null}
            </Row>
            {assignments.length === 0 ? (
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.noVariantFlags} />
              </TypographyP>
            ) : (
              assignments.map((assignment) => {
                const flag = flagsById.get(assignment.flagId);
                return (
                  <Row key={assignment.id} spacing="1.5u" align="spaceBetween" alignY="center">
                    <Rows spacing="0.5u">
                      <TypographyP size="small" weight="medium">
                        {flag?.key ?? assignment.flagId}
                      </TypographyP>
                      <TypographyP size="xsmall" tone="subtle">
                        <FormattedMessage {...messages.enabledLabel} />
                      </TypographyP>
                    </Rows>
                    <Row spacing="1u" alignY="center">
                      <Switch
                        checked={assignment.enabled}
                        disabled={!canWrite || toggleAssignment.isPending}
                        onCheckedChange={(checked) =>
                          toggleAssignment.mutate({
                            assignmentId: assignment.id,
                            enabled: Boolean(checked),
                          })
                        }
                      />
                      {canWrite ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAssignment.mutate(assignment.id)}
                          disabled={removeAssignment.isPending}
                        >
                          <FormattedMessage {...messages.removeFlag} />
                        </Button>
                      ) : null}
                    </Row>
                  </Row>
                );
              })
            )}
          </Rows>
        </Rows>
      </CardContent>
      <AttachFlagSheet
        open={sheetOpen}
        onOpenChange={(open) => uiStore.setVariantSheetOpen(variant.id, open)}
        organizationSlug={organizationSlug}
        variant={variant}
        flags={flags}
        assignedFlagIds={new Set(assignments.map((assignment) => assignment.flagId))}
        onRefresh={onRefresh}
      />
    </Card>
  );
});

function AttachFlagSheet({
  open,
  onOpenChange,
  organizationSlug,
  variant,
  flags,
  assignedFlagIds,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  variant: HyperlabVariant;
  flags: HyperlabFlag[];
  assignedFlagIds: Set<string>;
  onRefresh: () => Promise<void>;
}) {
  const intl = useIntl();
  const client = hyperlabClient();
  const available = flags.filter(
    (flag) => flag.kind === "experiment" && !assignedFlagIds.has(flag.id),
  );
  const firstAvailableId = available[0]?.id ?? "";
  const [tab, setTab] = useState("existing");
  const [flagId, setFlagId] = useState(firstAvailableId);
  const [newKey, setNewKey] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setFlagId(firstAvailableId);
    setNewKey("");
    setTab(firstAvailableId ? "existing" : "new");
  }, [open, firstAvailableId]);

  const attachExisting = useMutation({
    mutationFn: async () => {
      const response = await client.assignments.$post({
        param: { organizationSlug },
        json: { flagId, variantId: variant.id, enabled: true },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.createSuccess));
      onOpenChange(false);
      await onRefresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const createAndAttach = useMutation({
    mutationFn: async () => {
      const createResponse = await client.flags.$post({
        param: { organizationSlug },
        json: { key: newKey, kind: "experiment" },
      });
      const created = await readHyperlabJson<{ flag: HyperlabFlag }>(
        createResponse,
        intl.formatMessage(messages.loadError),
      );
      const assignResponse = await client.assignments.$post({
        param: { organizationSlug },
        json: { flagId: created.flag.id, variantId: variant.id, enabled: true },
      });
      return readHyperlabJson(assignResponse, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.createSuccess));
      onOpenChange(false);
      await onRefresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const flagItems = available.map((flag) => ({ value: flag.id, label: flag.key }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            <FormattedMessage {...messages.attachFlagTitle} values={{ variant: variant.key }} />
          </SheetTitle>
          <SheetDescription>
            <FormattedMessage {...messages.attachFlagDescription} />
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6">
          <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
            <TabsList className="w-full">
              <TabsTrigger value="existing">
                <FormattedMessage {...messages.existingFlagTab} />
              </TabsTrigger>
              <TabsTrigger value="new">
                <FormattedMessage {...messages.newFlagTab} />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="existing">
              {available.length === 0 ? (
                <TypographyP size="small" tone="subtle">
                  <FormattedMessage {...messages.noFlagsToAttach} />
                </TypographyP>
              ) : (
                <Field>
                  <FieldLabel>
                    <FormattedMessage {...messages.pickFlagLabel} />
                  </FieldLabel>
                  <Select
                    value={flagId}
                    items={flagItems}
                    onValueChange={(next) => {
                      if (next) {
                        setFlagId(next);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {flagItems.map((item) => (
                          <SelectItem key={item.value} value={item.value} label={item.label}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </TabsContent>
            <TabsContent value="new">
              <Field>
                <FieldLabel htmlFor="hyperlab-attach-new-flag">
                  <FormattedMessage {...messages.flagKeyLabel} />
                </FieldLabel>
                <Input
                  id="hyperlab-attach-new-flag"
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  placeholder="japan-checkout-cta"
                />
                <FieldDescription>
                  <FormattedMessage {...messages.flagKeyHint} />
                </FieldDescription>
              </Field>
            </TabsContent>
          </Tabs>
        </div>
        <SheetFooter>
          {tab === "existing" ? (
            <Button
              type="button"
              disabled={!flagId || attachExisting.isPending}
              onClick={() => attachExisting.mutate()}
            >
              {attachExisting.isPending ? <Spinner data-icon="inline-start" /> : null}
              <FormattedMessage {...messages.attachFlag} />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!newKey.trim() || createAndAttach.isPending}
              onClick={() => createAndAttach.mutate()}
            >
              {createAndAttach.isPending ? <Spinner data-icon="inline-start" /> : null}
              <FormattedMessage {...messages.createFlag} />
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
