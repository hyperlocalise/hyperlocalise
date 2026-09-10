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
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Rows } from "@/components/ui/layout/rows";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabAudience,
} from "./hyperlab-api";
import {
  criterionToRuleGroup,
  emptyRuleGroup,
  ruleGroupToCriterion,
  type HyperlabRuleGroup,
} from "./hyperlab-criterion";
import { HyperlabCriterionBuilder } from "./hyperlab-criterion-builder";
import { HyperlabPageShell } from "./hyperlab-page-shell";
import { HyperlabLoadError } from "./hyperlab-ui";

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
  const [description, setDescription] = useState("");
  const [group, setGroup] = useState<HyperlabRuleGroup>(emptyRuleGroup);
  const [baseline, setBaseline] = useState("");

  const detailQuery = useQuery({
    queryKey: hyperlabQueryKeys.audience(organizationSlug, audienceId),
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
    const audience = detailQuery.data.audience;
    const nextGroup = criterionToRuleGroup(audience.criterion);
    setName(audience.name);
    setDescription(audience.description ?? "");
    setGroup(nextGroup);
    setBaseline(
      JSON.stringify({
        name: audience.name,
        description: audience.description ?? "",
        group: nextGroup,
      }),
    );
  }, [detailQuery.data]);

  const current = JSON.stringify({ name, description, group });
  const dirty = current !== baseline && Boolean(detailQuery.data);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await client.audiences[":audienceId"].$put({
        param: { organizationSlug, audienceId },
        json: {
          name,
          description: description || null,
          criterion: ruleGroupToCriterion(group),
        },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      await queryClient.invalidateQueries({
        queryKey: hyperlabQueryKeys.audience(organizationSlug, audienceId),
      });
      await queryClient.invalidateQueries({
        queryKey: hyperlabQueryKeys.audiences(organizationSlug),
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  const audience = detailQuery.data?.audience;

  return (
    <HyperlabPageShell
      title={audience?.name ?? intl.formatMessage(messages.audiencesTitle)}
      description={intl.formatMessage(messages.audiencesDescription)}
      backHref={`/org/${organizationSlug}/hyperlab/audiences`}
    >
      <Rows spacing="2u">
        {detailQuery.isError ? (
          <HyperlabLoadError error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
        ) : null}
        {audience ? (
          <Card className={dirty ? "ring-foreground/40" : undefined}>
            <CardHeader>
              <CardTitle>
                <FormattedMessage {...messages.audienceRulesTitle} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Rows spacing="2u">
                <FieldGroup>
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
                    <FieldLabel htmlFor="hyperlab-audience-note">
                      <FormattedMessage {...messages.audienceDescriptionLabel} />
                    </FieldLabel>
                    <Textarea
                      id="hyperlab-audience-note"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                      disabled={!canWrite}
                    />
                  </Field>
                </FieldGroup>
                <TypographyP size="small" tone="subtle">
                  <FormattedMessage {...messages.audienceRulesHint} />
                </TypographyP>
                <HyperlabCriterionBuilder group={group} onChange={setGroup} disabled={!canWrite} />
              </Rows>
            </CardContent>
            {canWrite ? (
              <CardFooter className="gap-3">
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !dirty}
                >
                  {saveMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                  <FormattedMessage
                    {...(saveMutation.isPending ? messages.saving : messages.save)}
                  />
                </Button>
                {dirty ? (
                  <TypographyP size="small" tone="subtle">
                    <FormattedMessage {...messages.unsavedChanges} />
                  </TypographyP>
                ) : null}
              </CardFooter>
            ) : null}
          </Card>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}
