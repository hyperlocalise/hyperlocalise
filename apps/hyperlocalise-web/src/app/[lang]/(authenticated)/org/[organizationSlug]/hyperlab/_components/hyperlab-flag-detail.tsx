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
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Rows } from "@/components/ui/layout/rows";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabAssignment,
  type HyperlabExperiment,
  type HyperlabFlag,
  type HyperlabFlagConfig,
  type HyperlabVariant,
} from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";
import { HyperlabLoadError } from "./hyperlab-ui";

export function HyperlabFlagDetail({
  organizationSlug,
  flagId,
  canWrite,
}: {
  organizationSlug: string;
  flagId: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const [description, setDescription] = useState("");
  const [configText, setConfigText] = useState("{}");

  const detailQuery = useQuery({
    queryKey: hyperlabQueryKeys.flag(organizationSlug, flagId),
    queryFn: async () => {
      const response = await client.flags[":flagId"].$get({
        param: { organizationSlug, flagId },
      });
      return readHyperlabJson<{ flag: HyperlabFlag; config: HyperlabFlagConfig }>(
        response,
        intl.formatMessage(messages.loadError),
      );
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
      return body.assignments.filter((assignment) => assignment.flagId === flagId);
    },
  });
  const experimentsQuery = useQuery({
    queryKey: hyperlabQueryKeys.experiments(organizationSlug),
    queryFn: async () => {
      const response = await client.experiments.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ experiments: HyperlabExperiment[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.experiments;
    },
  });

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }
    setDescription(detailQuery.data.flag.description ?? "");
    if (detailQuery.data.config.value !== null && detailQuery.data.config.value !== undefined) {
      setConfigText(JSON.stringify(detailQuery.data.config.value, null, 2));
    }
  }, [detailQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await client.flags[":flagId"].$put({
        param: { organizationSlug, flagId },
        json: { description },
      });
      await readHyperlabJson(response, intl.formatMessage(messages.loadError));
      if (detailQuery.data?.flag.kind === "config") {
        const parsed = JSON.parse(configText) as unknown;
        const configResponse = await client.flags[":flagId"].config.$put({
          param: { organizationSlug, flagId },
          json: { value: parsed },
        });
        await readHyperlabJson(configResponse, intl.formatMessage(messages.loadError));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      await queryClient.invalidateQueries({
        queryKey: hyperlabQueryKeys.flag(organizationSlug, flagId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof SyntaxError
          ? intl.formatMessage(messages.invalidJson)
          : error instanceof Error
            ? error.message
            : intl.formatMessage(messages.loadError);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await client.flags[":flagId"].$delete({
        param: { organizationSlug, flagId },
      });
      if (!response.ok) {
        await readHyperlabJson(response, intl.formatMessage(messages.loadError));
      }
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(messages.deleteSuccess));
      router.push(`/org/${organizationSlug}/hyperlab/flags`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const flag = detailQuery.data?.flag;
  const assignments = assignmentsQuery.data ?? [];

  return (
    <HyperlabPageShell
      title={flag?.key ?? intl.formatMessage(messages.flagsTitle)}
      description={intl.formatMessage(messages.flagsDescription)}
      backHref={`/org/${organizationSlug}/hyperlab/flags`}
      actions={
        canWrite ? (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" />}>
              <FormattedMessage {...messages.delete} />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <FormattedMessage {...messages.deleteFlagTitle} />
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <FormattedMessage
                    {...messages.deleteFlagBody}
                    values={{ name: flag?.key ?? "" }}
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <FormattedMessage {...messages.cancel} />
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  <FormattedMessage {...messages.delete} />
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null
      }
    >
      <Rows spacing="2u">
        {detailQuery.isError ? (
          <HyperlabLoadError error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
        ) : null}
        {flag ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  <FormattedMessage {...messages.generalCardTitle} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="hyperlab-flag-key">
                      <FormattedMessage {...messages.flagKeyLabel} />
                    </FieldLabel>
                    <Input id="hyperlab-flag-key" value={flag.key} disabled />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="hyperlab-flag-description">
                      <FormattedMessage {...messages.flagDescriptionLabel} />
                    </FieldLabel>
                    <Input
                      id="hyperlab-flag-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      disabled={!canWrite}
                    />
                  </Field>
                  {flag.kind === "config" ? (
                    <Field>
                      <FieldLabel htmlFor="hyperlab-flag-config">
                        <FormattedMessage {...messages.configJsonLabel} />
                      </FieldLabel>
                      <Textarea
                        id="hyperlab-flag-config"
                        value={configText}
                        onChange={(event) => setConfigText(event.target.value)}
                        rows={8}
                        disabled={!canWrite}
                      />
                      <FieldDescription>
                        <FormattedMessage {...messages.configJsonHint} />
                      </FieldDescription>
                    </Field>
                  ) : null}
                </FieldGroup>
              </CardContent>
              {canWrite ? (
                <CardFooter>
                  <Button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                    <FormattedMessage
                      {...(saveMutation.isPending ? messages.saving : messages.save)}
                    />
                  </Button>
                </CardFooter>
              ) : null}
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <FormattedMessage {...messages.assignmentsTitle} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <TypographyP size="small" tone="subtle">
                    <FormattedMessage {...messages.noAssignments} />
                  </TypographyP>
                ) : (
                  <FlagAssignmentList
                    organizationSlug={organizationSlug}
                    assignments={assignments}
                    experiments={experimentsQuery.data ?? []}
                    client={client}
                    loadError={intl.formatMessage(messages.loadError)}
                  />
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}

function FlagAssignmentList({
  organizationSlug,
  assignments,
  experiments,
  client,
  loadError,
}: {
  organizationSlug: string;
  assignments: HyperlabAssignment[];
  experiments: HyperlabExperiment[];
  client: ReturnType<typeof hyperlabClient>;
  loadError: string;
}) {
  const variantsQuery = useQuery({
    queryKey: [
      "hyperlab-assignment-variants",
      organizationSlug,
      assignments.map((item) => item.variantId),
    ],
    queryFn: async () => {
      const details = await Promise.all(
        experiments.map(async (experiment) => {
          const response = await client.experiments[":experimentId"].$get({
            param: { organizationSlug, experimentId: experiment.id },
          });
          const body = await readHyperlabJson<{ variants: HyperlabVariant[] }>(response, loadError);
          return { experiment, variants: body.variants };
        }),
      );
      return details;
    },
    enabled: experiments.length > 0 && assignments.length > 0,
  });

  const rows = assignments.flatMap((assignment) => {
    for (const detail of variantsQuery.data ?? []) {
      const variant = detail.variants.find((item) => item.id === assignment.variantId);
      if (variant) {
        return [{ assignment, experiment: detail.experiment, variant }];
      }
    }
    return [];
  });

  if (rows.length === 0) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.noAssignments} />
      </TypographyP>
    );
  }

  return (
    <Rows spacing="1u">
      {rows.map((row) => (
        <Link
          key={row.assignment.id}
          href={`/org/${organizationSlug}/hyperlab/experiments/${row.experiment.id}`}
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          {row.experiment.name} · {row.variant.key}
        </Link>
      ))}
    </Rows>
  );
}
