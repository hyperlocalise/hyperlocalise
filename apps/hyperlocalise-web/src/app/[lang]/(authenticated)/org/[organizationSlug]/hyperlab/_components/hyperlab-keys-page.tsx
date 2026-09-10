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
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabClientKey,
} from "./hyperlab-api";
import { HyperlabCreateKeyDialog } from "./hyperlab-create-dialogs";
import { HyperlabPageShell } from "./hyperlab-page-shell";
import {
  HyperlabEmptyState,
  HyperlabLoadError,
  HyperlabLoadingRows,
  HyperlabTable,
  HyperlabTableCell,
  HyperlabTableRow,
} from "./hyperlab-ui";

export function HyperlabKeysPage({
  organizationSlug,
  canWrite,
}: {
  organizationSlug: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const keysQuery = useQuery({
    queryKey: hyperlabQueryKeys.keys(organizationSlug),
    queryFn: async () => {
      const response = await client.keys.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ keys: HyperlabClientKey[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.keys;
    },
  });
  const keys = keysQuery.data ?? [];
  const createAction = canWrite ? (
    <HyperlabCreateKeyDialog organizationSlug={organizationSlug} onCreated={setCreatedSecret} />
  ) : null;

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await client.keys[":keyId"].$delete({
        param: { organizationSlug, keyId },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      await queryClient.invalidateQueries({ queryKey: hyperlabQueryKeys.keys(organizationSlug) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  return (
    <HyperlabPageShell
      title={intl.formatMessage(messages.keysTitle)}
      description={intl.formatMessage(messages.keysDescription)}
      actions={createAction}
    >
      <Rows spacing="2u">
        {createdSecret ? (
          <Box border="standard" borderRadius="standard" background="muted" padding="2u">
            <Rows spacing="1u">
              <TypographyP wrapStyle="pretty" size="small" weight="medium">
                <FormattedMessage {...messages.copySecret} />
              </TypographyP>
              <code className="overflow-x-auto text-sm">{createdSecret}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
                  void navigator.clipboard.writeText(createdSecret);
                  toast.success(intl.formatMessage(messages.copied));
                }}
              >
                <FormattedMessage {...messages.copyKey} />
              </Button>
            </Rows>
          </Box>
        ) : null}
        {keysQuery.isError ? (
          <HyperlabLoadError error={keysQuery.error} onRetry={() => void keysQuery.refetch()} />
        ) : null}
        {keysQuery.isLoading ? <HyperlabLoadingRows /> : null}
        {!keysQuery.isLoading && keys.length === 0 ? (
          <HyperlabEmptyState
            title={<FormattedMessage {...messages.keysEmptyTitle} />}
            description={<FormattedMessage {...messages.keysEmpty} />}
            action={createAction}
          />
        ) : null}
        {keys.length > 0 ? (
          <HyperlabTable
            headers={[
              intl.formatMessage(messages.keyNameLabel),
              intl.formatMessage(messages.keyPrefixColumn),
              "",
            ]}
          >
            {keys.map((key) => (
              <HyperlabTableRow key={key.id}>
                <HyperlabTableCell>
                  <TypographyP weight="medium">{key.name}</TypographyP>
                </HyperlabTableCell>
                <HyperlabTableCell>
                  <TypographyP size="small" tone="subtle">
                    {key.keyPrefix}…
                  </TypographyP>
                </HyperlabTableCell>
                <HyperlabTableCell>
                  <Row spacing="1u" alignY="center">
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
                </HyperlabTableCell>
              </HyperlabTableRow>
            ))}
          </HyperlabTable>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}
