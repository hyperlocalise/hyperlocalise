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

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import { hyperlabClient, readHyperlabJson, type HyperlabFlag } from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";

export function HyperlabFlagsPage({
  organizationSlug,
  canWrite,
}: {
  organizationSlug: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [kind, setKind] = useState<"experiment" | "config">("experiment");
  const client = hyperlabClient();

  const flagsQuery = useQuery({
    queryKey: ["hyperlab-flags", organizationSlug],
    queryFn: async () => {
      const response = await client.flags.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ flags: HyperlabFlag[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.flags;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await client.flags.$post({
        param: { organizationSlug },
        json: { key, kind },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      setKey("");
      await queryClient.invalidateQueries({ queryKey: ["hyperlab-flags", organizationSlug] });
    },
  });

  const flags = flagsQuery.data ?? [];

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="flags"
      title={intl.formatMessage(messages.flagsTitle)}
      description={intl.formatMessage(messages.flagsDescription)}
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
                  <FieldLabel htmlFor="hyperlab-flag-key">
                    <FormattedMessage {...messages.flagKeyLabel} />
                  </FieldLabel>
                  <Input
                    id="hyperlab-flag-key"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder="checkout-cta"
                    required
                  />
                </Field>
              </Column>
              <Column width="content">
                <Field>
                  <FieldLabel htmlFor="hyperlab-flag-kind">
                    <FormattedMessage {...messages.flagKindLabel} />
                  </FieldLabel>
                  <select
                    id="hyperlab-flag-kind"
                    className="h-9 rounded-md border border-border bg-transparent px-3 text-sm"
                    value={kind}
                    onChange={(event) => setKind(event.target.value as "experiment" | "config")}
                  >
                    <option value="experiment">
                      {intl.formatMessage(messages.flagKindExperiment)}
                    </option>
                    <option value="config">{intl.formatMessage(messages.flagKindConfig)}</option>
                  </select>
                </Field>
              </Column>
              <Column width="content">
                <Button type="submit" disabled={!key || createMutation.isPending}>
                  <FormattedMessage {...messages.createFlag} />
                </Button>
              </Column>
            </Columns>
          </form>
        ) : null}

        {flagsQuery.isError ? (
          <TypographyP wrapStyle="pretty" size="small" tone="critical">
            {flagsQuery.error instanceof Error
              ? flagsQuery.error.message
              : intl.formatMessage(messages.loadError)}
          </TypographyP>
        ) : null}
        {flagsQuery.isLoading ? (
          <TypographyP wrapStyle="pretty" size="small" tone="subtle">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
        ) : null}
        {!flagsQuery.isLoading && flags.length === 0 ? (
          <TypographyP wrapStyle="pretty" size="small" tone="subtle">
            <FormattedMessage {...messages.flagsEmpty} />
          </TypographyP>
        ) : null}
        {flags.length > 0 ? (
          <Box border="standard" borderRadius="standard">
            <Rows spacing="0">
              {flags.map((flag) => (
                <Box key={flag.id} paddingX="2u" paddingY="1.5u">
                  <Rows spacing="0.5u">
                    <Link
                      href={`/org/${organizationSlug}/hyperlab/flags/${flag.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {flag.key}
                    </Link>
                    <TypographyP size="small" tone="subtle">
                      {flag.kind}
                    </TypographyP>
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
