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
  type HyperlabAudience,
} from "./hyperlab-api";
import { HyperlabCreateAudienceDialog } from "./hyperlab-create-dialogs";
import { summarizeCriterion } from "./hyperlab-criterion";
import { HyperlabPageShell } from "./hyperlab-page-shell";
import {
  HyperlabEmptyState,
  HyperlabLoadError,
  HyperlabLoadingRows,
  HyperlabTable,
  HyperlabTableCell,
  HyperlabTableRow,
} from "./hyperlab-ui";

export function HyperlabAudiencesPage({
  organizationSlug,
  canWrite,
}: {
  organizationSlug: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const client = hyperlabClient();
  const audiencesQuery = useQuery({
    queryKey: hyperlabQueryKeys.audiences(organizationSlug),
    queryFn: async () => {
      const response = await client.audiences.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ audiences: HyperlabAudience[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.audiences;
    },
  });
  const audiences = audiencesQuery.data ?? [];
  const createAction = canWrite ? (
    <HyperlabCreateAudienceDialog organizationSlug={organizationSlug} />
  ) : null;

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="audiences"
      title={intl.formatMessage(messages.audiencesTitle)}
      description={intl.formatMessage(messages.audiencesDescription)}
      actions={createAction}
    >
      {audiencesQuery.isError ? (
        <HyperlabLoadError
          error={audiencesQuery.error}
          onRetry={() => void audiencesQuery.refetch()}
        />
      ) : null}
      {audiencesQuery.isLoading ? <HyperlabLoadingRows /> : null}
      {!audiencesQuery.isLoading && audiences.length === 0 ? (
        <HyperlabEmptyState
          title={<FormattedMessage {...messages.audiencesEmptyTitle} />}
          description={<FormattedMessage {...messages.audiencesEmpty} />}
          action={createAction}
        />
      ) : null}
      {audiences.length > 0 ? (
        <HyperlabTable
          headers={[
            intl.formatMessage(messages.audienceNameLabel),
            intl.formatMessage(messages.audienceDescriptionLabel),
            intl.formatMessage(messages.audienceColumnRules),
            "",
          ]}
        >
          {audiences.map((audience) => (
            <HyperlabTableRow key={audience.id}>
              <HyperlabTableCell>
                <Link
                  href={`/org/${organizationSlug}/hyperlab/audiences/${audience.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {audience.name}
                </Link>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <TypographyP size="small" tone="subtle">
                  {audience.description || "—"}
                </TypographyP>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <TypographyP size="small" tone="subtle">
                  {summarizeCriterion(audience.criterion) || "—"}
                </TypographyP>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <Button
                  variant="secondary"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`/org/${organizationSlug}/hyperlab/audiences/${audience.id}`} />
                  }
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
