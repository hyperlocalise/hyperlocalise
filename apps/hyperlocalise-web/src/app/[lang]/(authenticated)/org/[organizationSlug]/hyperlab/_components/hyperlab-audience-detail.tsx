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

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Rows } from "@/components/ui/layout/rows";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";

import { experimentCriterionNodeSchema } from "@/lib/experiments/criterion";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import { hyperlabClient, readHyperlabJson, type HyperlabAudience } from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";

const SAMPLE_CRITERION = `{
  "type": "attribute",
  "name": "plan",
  "match": "exact",
  "value": "pro"
}`;

export function HyperlabAudienceDetail({
  organizationSlug,
  audienceId,
  canWrite,
}: {
  organizationSlug: string;
  audienceId: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const [name, setName] = useState("");
  const [criterionText, setCriterionText] = useState(SAMPLE_CRITERION);

  const detailQuery = useQuery({
    queryKey: ["hyperlab-audience", organizationSlug, audienceId],
    queryFn: async () => {
      const response = await client.audiences[":audienceId"].$get({
        param: { organizationSlug, audienceId },
      });
      return readHyperlabJson<{ audience: HyperlabAudience }>(
        response,
        intl.formatMessage(messages.loadError),
      );
    },
  });

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }
    setName(detailQuery.data.audience.name);
    if (detailQuery.data.audience.criterion) {
      setCriterionText(JSON.stringify(detailQuery.data.audience.criterion, null, 2));
    }
  }, [detailQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const criterion = criterionText.trim()
        ? experimentCriterionNodeSchema.parse(JSON.parse(criterionText))
        : null;
      const response = await client.audiences[":audienceId"].$put({
        param: { organizationSlug, audienceId },
        json: { name, criterion },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["hyperlab-audience", organizationSlug, audienceId],
      });
    },
  });

  const audience = detailQuery.data?.audience;

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="audiences"
      title={audience?.name ?? intl.formatMessage(messages.audiencesTitle)}
      description={intl.formatMessage(messages.audiencesDescription)}
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
        {audience ? (
          <Rows spacing="2u">
            <Field>
              <FieldLabel htmlFor="hyperlab-audience-name">
                <FormattedMessage {...messages.audienceNameLabel} />
              </FieldLabel>
              <Input
                id="hyperlab-audience-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canWrite}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hyperlab-audience-criterion">
                <FormattedMessage {...messages.criterionLabel} />
              </FieldLabel>
              <Textarea
                id="hyperlab-audience-criterion"
                value={criterionText}
                onChange={(event) => setCriterionText(event.target.value)}
                rows={10}
                disabled={!canWrite}
              />
              <FieldDescription>
                <FormattedMessage {...messages.criterionHint} />
              </FieldDescription>
            </Field>
            {canWrite ? (
              <Button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                <FormattedMessage {...messages.save} />
              </Button>
            ) : null}
          </Rows>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}
