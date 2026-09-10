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
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabFlag,
} from "./hyperlab-api";
import { HyperlabCreateFlagDialog } from "./hyperlab-create-dialogs";
import { HyperlabPageShell } from "./hyperlab-page-shell";
import {
  HyperlabEmptyState,
  HyperlabLoadError,
  HyperlabLoadingRows,
  HyperlabTable,
  HyperlabTableCell,
  HyperlabTableRow,
} from "./hyperlab-ui";

export function HyperlabFlagsPage({
  organizationSlug,
  canWrite,
}: {
  organizationSlug: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const client = hyperlabClient();
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
  const flags = flagsQuery.data ?? [];
  const createAction = canWrite ? (
    <HyperlabCreateFlagDialog organizationSlug={organizationSlug} />
  ) : null;

  return (
    <HyperlabPageShell
      title={intl.formatMessage(messages.flagsTitle)}
      description={intl.formatMessage(messages.flagsDescription)}
      actions={createAction}
    >
      {flagsQuery.isError ? (
        <HyperlabLoadError error={flagsQuery.error} onRetry={() => void flagsQuery.refetch()} />
      ) : null}
      {flagsQuery.isLoading ? <HyperlabLoadingRows /> : null}
      {!flagsQuery.isLoading && flags.length === 0 ? (
        <HyperlabEmptyState
          title={<FormattedMessage {...messages.flagsEmptyTitle} />}
          description={<FormattedMessage {...messages.flagsEmpty} />}
          action={createAction}
        />
      ) : null}
      {flags.length > 0 ? (
        <HyperlabTable
          headers={[
            intl.formatMessage(messages.flagColumnName),
            intl.formatMessage(messages.flagColumnKind),
            intl.formatMessage(messages.flagColumnNote),
            intl.formatMessage(messages.flagColumnUpdated),
            "",
          ]}
        >
          {flags.map((flag) => (
            <HyperlabTableRow key={flag.id}>
              <HyperlabTableCell>
                <Link
                  href={`/org/${organizationSlug}/hyperlab/flags/${flag.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {flag.key}
                </Link>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <TypographyP size="small" tone="subtle">
                  {flag.kind === "config"
                    ? intl.formatMessage(messages.flagKindConfig)
                    : intl.formatMessage(messages.flagKindExperiment)}
                </TypographyP>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <TypographyP size="small" tone="subtle">
                  {flag.description || "—"}
                </TypographyP>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <TypographyP size="small" tone="subtle">
                  {new Date(flag.updatedAt).toLocaleDateString(intl.locale)}
                </TypographyP>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <Button
                  variant="secondary"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/org/${organizationSlug}/hyperlab/flags/${flag.id}`} />}
                >
                  <FormattedMessage {...messages.view} />
                </Button>
              </HyperlabTableCell>
            </HyperlabTableRow>
          ))}
        </HyperlabTable>
      ) : null}
    </HyperlabPageShell>
  );
}
