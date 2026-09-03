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
import { hyperlabClient, readHyperlabJson, type HyperlabAudience } from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";

export function HyperlabAudiencesPage({
  organizationSlug,
  canWrite,
}: {
  organizationSlug: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const client = hyperlabClient();

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await client.audiences.$post({
        param: { organizationSlug },
        json: { name },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["hyperlab-audiences", organizationSlug] });
    },
  });

  const audiences = audiencesQuery.data ?? [];

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="audiences"
      title={intl.formatMessage(messages.audiencesTitle)}
      description={intl.formatMessage(messages.audiencesDescription)}
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
                  <FieldLabel htmlFor="hyperlab-audience-name">
                    <FormattedMessage {...messages.audienceNameLabel} />
                  </FieldLabel>
                  <Input
                    id="hyperlab-audience-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </Field>
              </Column>
              <Column width="content">
                <Button type="submit" disabled={!name || createMutation.isPending}>
                  <FormattedMessage {...messages.createAudience} />
                </Button>
              </Column>
            </Columns>
          </form>
        ) : null}

        {audiencesQuery.isError ? (
          <TypographyP className="text-pretty text-sm text-destructive">
            {audiencesQuery.error instanceof Error
              ? audiencesQuery.error.message
              : intl.formatMessage(messages.loadError)}
          </TypographyP>
        ) : null}
        {audiencesQuery.isLoading ? (
          <TypographyP className="text-pretty text-sm text-muted-foreground">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
        ) : null}
        {!audiencesQuery.isLoading && audiences.length === 0 ? (
          <TypographyP className="text-pretty text-sm text-muted-foreground">
            <FormattedMessage {...messages.audiencesEmpty} />
          </TypographyP>
        ) : null}
        {audiences.length > 0 ? (
          <Box border="standard" borderRadius="standard">
            <Rows spacing="0">
              {audiences.map((audience) => (
                <Box key={audience.id} paddingX="2u" paddingY="1.5u">
                  <Link
                    href={`/org/${organizationSlug}/hyperlab/audiences/${audience.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {audience.name}
                  </Link>
                </Box>
              ))}
            </Rows>
          </Box>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}
