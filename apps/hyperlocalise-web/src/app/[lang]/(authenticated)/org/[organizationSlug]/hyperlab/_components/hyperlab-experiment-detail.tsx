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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  readHyperlabJson,
  type HyperlabAllocation,
  type HyperlabAudience,
  type HyperlabExperiment,
  type HyperlabVariant,
} from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";

export function HyperlabExperimentDetail({
  organizationSlug,
  experimentId,
  canWrite,
}: {
  organizationSlug: string;
  experimentId: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const [name, setName] = useState("");
  const [rolloutPercentage, setRolloutPercentage] = useState("10000");
  const [audienceId, setAudienceId] = useState("");
  const [variantKey, setVariantKey] = useState("");

  const detailQuery = useQuery({
    queryKey: ["hyperlab-experiment", organizationSlug, experimentId],
    queryFn: async () => {
      const response = await client.experiments[":experimentId"].$get({
        param: { organizationSlug, experimentId },
      });
      return readHyperlabJson<{
        experiment: HyperlabExperiment;
        variants: HyperlabVariant[];
        allocations: HyperlabAllocation[];
      }>(response, intl.formatMessage(messages.loadError));
    },
  });

  const audiencesQuery = useQuery({
    queryKey: ["hyperlab-audiences", organizationSlug],
    queryFn: async () => {
      const response = await client.audiences.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ audiences: HyperlabAudience[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.audiences;
    },
  });

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }
    setName(detailQuery.data.experiment.name);
    setRolloutPercentage(String(detailQuery.data.experiment.rolloutPercentage));
    setAudienceId(detailQuery.data.experiment.audienceId ?? "");
  }, [detailQuery.data]);

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: ["hyperlab-experiment", organizationSlug, experimentId],
    });
  }

  const saveMutation = useMutation({
    mutationFn: async (status?: HyperlabExperiment["status"]) => {
      const response = await client.experiments[":experimentId"].$put({
        param: { organizationSlug, experimentId },
        json: {
          name,
          rolloutPercentage: Number(rolloutPercentage),
          audienceId: audienceId || null,
          status,
        },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: refresh,
  });

  const addVariantMutation = useMutation({
    mutationFn: async () => {
      const response = await client.experiments[":experimentId"].variants.$post({
        param: { organizationSlug, experimentId },
        json: { key: variantKey, isControl: (detailQuery.data?.variants.length ?? 0) === 0 },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      setVariantKey("");
      await refresh();
    },
  });

  const experiment = detailQuery.data?.experiment;
  const allocationsByVariant = new Map(
    (detailQuery.data?.allocations ?? []).map((allocation) => [allocation.variantId, allocation]),
  );

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="experiments"
      title={experiment?.name ?? intl.formatMessage(messages.experimentsTitle)}
      description={intl.formatMessage(messages.experimentsDescription)}
      actions={
        canWrite && experiment ? (
          <Row spacing="1u" alignY="center">
            {experiment.status !== "active" ? (
              <Button type="button" onClick={() => saveMutation.mutate("active")}>
                <FormattedMessage {...messages.activate} />
              </Button>
            ) : null}
            {experiment.status !== "archived" ? (
              <Button type="button" variant="outline" onClick={() => saveMutation.mutate("archived")}>
                <FormattedMessage {...messages.archive} />
              </Button>
            ) : null}
          </Row>
        ) : null
      }
    >
      <Rows spacing="2u">
        {detailQuery.isError ? (
          <TypographyP className="text-pretty text-sm text-destructive">
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : intl.formatMessage(messages.loadError)}
          </TypographyP>
        ) : null}
        {detailQuery.isLoading ? (
          <TypographyP className="text-pretty text-sm text-muted-foreground">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
        ) : null}
        {experiment ? (
          <Rows spacing="2u">
            <Row spacing="1u" alignY="center">
              <Badge variant="outline">{experiment.status}</Badge>
              <TypographyP className="text-sm text-muted-foreground">{experiment.kind}</TypographyP>
            </Row>
            <Field>
              <FieldLabel htmlFor="hyperlab-experiment-name">
                <FormattedMessage {...messages.experimentNameLabel} />
              </FieldLabel>
              <Input
                id="hyperlab-experiment-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canWrite}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hyperlab-experiment-rollout">
                <FormattedMessage {...messages.rolloutLabel} />
              </FieldLabel>
              <Input
                id="hyperlab-experiment-rollout"
                type="number"
                min={0}
                max={10000}
                value={rolloutPercentage}
                onChange={(event) => setRolloutPercentage(event.target.value)}
                disabled={!canWrite}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hyperlab-experiment-audience">
                <FormattedMessage {...messages.audienceOptional} />
              </FieldLabel>
              <select
                id="hyperlab-experiment-audience"
                className="h-9 rounded-md border border-border bg-transparent px-3 text-sm"
                value={audienceId}
                onChange={(event) => setAudienceId(event.target.value)}
                disabled={!canWrite}
              >
                <option value="">{intl.formatMessage(messages.none)}</option>
                {(audiencesQuery.data ?? []).map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.name}
                  </option>
                ))}
              </select>
            </Field>
            {canWrite ? (
              <Button type="button" onClick={() => saveMutation.mutate(undefined)} disabled={saveMutation.isPending}>
                <FormattedMessage {...messages.save} />
              </Button>
            ) : null}

            <Rows spacing="1.5u">
              <h2 className="text-sm font-medium">
                <FormattedMessage {...messages.variantsTitle} />
              </h2>
              {canWrite ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    addVariantMutation.mutate();
                  }}
                >
                  <Columns spacing="1.5u" alignY="end" collapseBelow="small">
                    <Column width="fluid">
                      <Field>
                        <FieldLabel htmlFor="hyperlab-variant-key">
                          <FormattedMessage {...messages.flagKeyLabel} />
                        </FieldLabel>
                        <Input
                          id="hyperlab-variant-key"
                          value={variantKey}
                          onChange={(event) => setVariantKey(event.target.value)}
                          placeholder="treatment"
                          required
                        />
                      </Field>
                    </Column>
                    <Column width="content">
                      <Button type="submit" disabled={!variantKey || addVariantMutation.isPending}>
                        <FormattedMessage {...messages.addVariant} />
                      </Button>
                    </Column>
                  </Columns>
                </form>
              ) : null}
              <Box border="standard" borderRadius="standard">
                <Rows spacing="0">
                  {(detailQuery.data?.variants ?? []).map((variant) => {
                    const allocation = allocationsByVariant.get(variant.id);
                    return (
                      <Box key={variant.id} paddingX="2u" paddingY="1.5u">
                        <Row spacing="1.5u" align="space-between" alignY="center">
                          <Rows spacing="0.5u">
                            <TypographyP className="font-medium">{variant.key}</TypographyP>
                            <TypographyP className="text-xs text-muted-foreground">
                              {variant.id}
                            </TypographyP>
                          </Rows>
                          <Row spacing="1u" alignY="center">
                            {variant.isControl ? (
                              <Badge variant="outline">
                                <FormattedMessage {...messages.control} />
                              </Badge>
                            ) : null}
                            <TypographyP className="text-sm tabular-nums text-muted-foreground">
                              {variant.rolloutPercentage}
                            </TypographyP>
                            {allocation ? (
                              <TypographyP className="text-sm tabular-nums text-muted-foreground">
                                <FormattedMessage
                                  {...messages.allocation}
                                  values={{ start: allocation.start, end: allocation.end }}
                                />
                              </TypographyP>
                            ) : null}
                          </Row>
                        </Row>
                      </Box>
                    );
                  })}
                </Rows>
              </Box>
            </Rows>
          </Rows>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}
