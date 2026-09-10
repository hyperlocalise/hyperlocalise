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
  type HyperlabExperiment,
} from "./hyperlab-api";
import { HyperlabCreateExperimentDialog } from "./hyperlab-create-dialogs";
import { HyperlabPageShell } from "./hyperlab-page-shell";
import { formatScheduleRange } from "./hyperlab-schedule";
import { HyperlabStatusBadge } from "./hyperlab-status-badge";
import {
  HyperlabEmptyState,
  HyperlabLoadError,
  HyperlabLoadingRows,
  HyperlabTable,
  HyperlabTableCell,
  HyperlabTableRow,
} from "./hyperlab-ui";

export function HyperlabExperimentsPage({
  organizationSlug,
  canWrite,
}: {
  organizationSlug: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const client = hyperlabClient();
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
  const experiments = experimentsQuery.data ?? [];
  const createAction = canWrite ? (
    <HyperlabCreateExperimentDialog organizationSlug={organizationSlug} />
  ) : null;

  return (
    <HyperlabPageShell
      title={intl.formatMessage(messages.experimentsTitle)}
      description={intl.formatMessage(messages.experimentsDescription)}
      actions={createAction}
    >
      {experimentsQuery.isError ? (
        <HyperlabLoadError
          error={experimentsQuery.error}
          onRetry={() => void experimentsQuery.refetch()}
        />
      ) : null}
      {experimentsQuery.isLoading ? <HyperlabLoadingRows /> : null}
      {!experimentsQuery.isLoading && experiments.length === 0 ? (
        <HyperlabEmptyState
          title={<FormattedMessage {...messages.experimentsEmptyTitle} />}
          description={<FormattedMessage {...messages.experimentsEmpty} />}
          action={createAction}
        />
      ) : null}
      {experiments.length > 0 ? (
        <HyperlabTable
          headers={[
            intl.formatMessage(messages.experimentNameLabel),
            intl.formatMessage(messages.experimentStatusLabel),
            intl.formatMessage(messages.experimentKindLabel),
            intl.formatMessage(messages.scheduleColumn),
            "",
          ]}
        >
          {experiments.map((experiment) => (
            <HyperlabTableRow key={experiment.id}>
              <HyperlabTableCell>
                <Link
                  href={`/org/${organizationSlug}/hyperlab/experiments/${experiment.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {experiment.name}
                </Link>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <HyperlabStatusBadge status={experiment.status} endAt={experiment.endAt} />
              </HyperlabTableCell>
              <HyperlabTableCell>
                <TypographyP size="small" tone="subtle">
                  {experiment.kind === "toggle"
                    ? intl.formatMessage(messages.experimentKindToggle)
                    : intl.formatMessage(messages.experimentKindAb)}
                </TypographyP>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <TypographyP size="small" tone="subtle">
                  {formatScheduleRange(
                    experiment.startAt,
                    experiment.endAt,
                    experiment.timezone || "UTC",
                    intl.locale,
                  )}
                </TypographyP>
              </HyperlabTableCell>
              <HyperlabTableCell>
                <Button
                  variant="secondary"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`/org/${organizationSlug}/hyperlab/experiments/${experiment.id}`} />
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
