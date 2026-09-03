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
import { hyperlabClient, readHyperlabJson, type HyperlabClientKey } from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";

export function HyperlabKeysPage({
  organizationSlug,
  canWrite,
}: {
  organizationSlug: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const client = hyperlabClient();

  const keysQuery = useQuery({
    queryKey: ["hyperlab-keys", organizationSlug],
    queryFn: async () => {
      const response = await client.keys.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ keys: HyperlabClientKey[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.keys;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await client.keys.$post({
        param: { organizationSlug },
        json: { name },
      });
      return readHyperlabJson<{ key: HyperlabClientKey }>(
        response,
        intl.formatMessage(messages.loadError),
      );
    },
    onSuccess: async (body) => {
      setName("");
      setCreatedSecret(body.key.secret ?? null);
      await queryClient.invalidateQueries({ queryKey: ["hyperlab-keys", organizationSlug] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await client.keys[":keyId"].$delete({
        param: { organizationSlug, keyId },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hyperlab-keys", organizationSlug] });
    },
  });

  const keys = keysQuery.data ?? [];

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="keys"
      title={intl.formatMessage(messages.keysTitle)}
      description={intl.formatMessage(messages.keysDescription)}
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
                  <FieldLabel htmlFor="hyperlab-key-name">
                    <FormattedMessage {...messages.keyNameLabel} />
                  </FieldLabel>
                  <Input
                    id="hyperlab-key-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </Field>
              </Column>
              <Column width="content">
                <Button type="submit" disabled={!name || createMutation.isPending}>
                  <FormattedMessage {...messages.createKey} />
                </Button>
              </Column>
            </Columns>
          </form>
        ) : null}

        {createdSecret ? (
          <Box border="standard" borderRadius="standard" background="muted" padding="2u">
            <Rows spacing="1u">
              <TypographyP className="text-pretty text-sm font-medium">
                <FormattedMessage {...messages.copySecret} />
              </TypographyP>
              <code className="overflow-x-auto text-sm">{createdSecret}</code>
            </Rows>
          </Box>
        ) : null}

        {keysQuery.isError ? (
          <TypographyP className="text-pretty text-sm text-destructive">
            {keysQuery.error instanceof Error
              ? keysQuery.error.message
              : intl.formatMessage(messages.loadError)}
          </TypographyP>
        ) : null}
        {keysQuery.isLoading ? (
          <TypographyP className="text-pretty text-sm text-muted-foreground">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
        ) : null}
        {!keysQuery.isLoading && keys.length === 0 ? (
          <TypographyP className="text-pretty text-sm text-muted-foreground">
            <FormattedMessage {...messages.keysEmpty} />
          </TypographyP>
        ) : null}
        {keys.length > 0 ? (
          <Box border="standard" borderRadius="standard">
            <Rows spacing="0">
              {keys.map((key) => (
                <Box key={key.id} paddingX="2u" paddingY="1.5u">
                  <Row spacing="1.5u" align="space-between" alignY="center">
                    <Rows spacing="0.5u">
                      <TypographyP className="font-medium">{key.name}</TypographyP>
                      <TypographyP className="text-sm text-muted-foreground">
                        {key.keyPrefix}…
                      </TypographyP>
                    </Rows>
                    {key.revokedAt ? (
                      <Badge variant="outline">
                        <FormattedMessage {...messages.revoked} />
                      </Badge>
                    ) : canWrite ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => revokeMutation.mutate(key.id)}
                        disabled={revokeMutation.isPending}
                      >
                        <FormattedMessage {...messages.revoke} />
                      </Button>
                    ) : null}
                  </Row>
                </Box>
              ))}
            </Rows>
          </Box>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}
