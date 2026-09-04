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
import Link from "next/link";
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
import { hyperlabClient, readHyperlabJson, type HyperlabExperiment } from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";

export function HyperlabExperimentsPage({
  organizationSlug,
  canWrite,
}: {
  organizationSlug: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"toggle" | "ab">("toggle");
  const client = hyperlabClient();

  const experimentsQuery = useQuery({
    queryKey: ["hyperlab-experiments", organizationSlug],
    queryFn: async () => {
      const response = await client.experiments.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ experiments: HyperlabExperiment[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.experiments;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await client.experiments.$post({
        param: { organizationSlug },
        json: { name, kind },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["hyperlab-experiments", organizationSlug] });
    },
  });

  const experiments = experimentsQuery.data ?? [];

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="experiments"
      title={intl.formatMessage(messages.experimentsTitle)}
      description={intl.formatMessage(messages.experimentsDescription)}
    >
      <Rows spacing="2u">
        {canWrite ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <Columns spacing="1.5u" alignY="end" collapseBelow="small">
              <Column width="fluid">
                <Field>
                  <FieldLabel htmlFor="hyperlab-experiment-name">
                    <FormattedMessage {...messages.experimentNameLabel} />
                  </FieldLabel>
                  <Input
                    id="hyperlab-experiment-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </Field>
              </Column>
              <Column width="content">
                <Field>
                  <FieldLabel htmlFor="hyperlab-experiment-kind">
                    <FormattedMessage {...messages.experimentKindLabel} />
                  </FieldLabel>
                  <select
                    id="hyperlab-experiment-kind"
                    className="h-9 rounded-md border border-border bg-transparent px-3 text-sm"
                    value={kind}
                    onChange={(event) => setKind(event.target.value as "toggle" | "ab")}
                  >
                    <option value="toggle">
                      {intl.formatMessage(messages.experimentKindToggle)}
                    </option>
                    <option value="ab">{intl.formatMessage(messages.experimentKindAb)}</option>
                  </select>
                </Field>
              </Column>
              <Column width="content">
                <Button type="submit" disabled={!name || createMutation.isPending}>
                  <FormattedMessage {...messages.createExperiment} />
                </Button>
              </Column>
            </Columns>
          </form>
        ) : null}

        {experimentsQuery.isError ? (
          <TypographyP wrapStyle="pretty" size="small" tone="critical">
            {experimentsQuery.error instanceof Error
              ? experimentsQuery.error.message
              : intl.formatMessage(messages.loadError)}
          </TypographyP>
        ) : null}
        {experimentsQuery.isLoading ? (
          <TypographyP wrapStyle="pretty" size="small" tone="subtle">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
        ) : null}
        {!experimentsQuery.isLoading && experiments.length === 0 ? (
          <TypographyP wrapStyle="pretty" size="small" tone="subtle">
            <FormattedMessage {...messages.experimentsEmpty} />
          </TypographyP>
        ) : null}
        {experiments.length > 0 ? (
          <Box border="standard" borderRadius="standard">
            <Rows spacing="0">
              {experiments.map((experiment) => (
                <Box key={experiment.id} paddingX="2u" paddingY="1.5u">
                  <Rows spacing="1u">
                    <Link
                      href={`/org/${organizationSlug}/hyperlab/experiments/${experiment.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {experiment.name}
                    </Link>
                    <Row spacing="1u" alignY="center">
                      <Badge variant="outline">{experiment.status}</Badge>
                      <TypographyP size="small" tone="subtle">
                        {experiment.kind}
                      </TypographyP>
                    </Row>
                  </Rows>
                </Box>
              ))}
            </Rows>
          </Box>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}
