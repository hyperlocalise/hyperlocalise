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
import { observer } from "mobx-react-lite";
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

import { HyperlabAudienceQueryBridge } from "../store/hyperlab-query-bridge";
import {
  HyperlabWorkspaceProvider,
  useHyperlabWorkspace,
} from "../store/hyperlab-workspace-context";
import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabAudience,
} from "./hyperlab-api";
import { ruleGroupToCriterion } from "./hyperlab-criterion";
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
  return (
    <HyperlabWorkspaceProvider>
      <HyperlabAudienceDetailConnected
        organizationSlug={organizationSlug}
        audienceId={audienceId}
        canWrite={canWrite}
      />
    </HyperlabWorkspaceProvider>
  );
}

const HyperlabAudienceDetailConnected = observer(function HyperlabAudienceDetailConnected({
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
  const { audience: audienceStore } = useHyperlabWorkspace();

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await client.audiences[":audienceId"].$put({
        param: { organizationSlug, audienceId },
        json: {
          name: audienceStore.name,
          description: audienceStore.description || null,
          criterion: ruleGroupToCriterion(audienceStore.group),
        },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      audienceStore.markSaved();
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
    <>
      <HyperlabAudienceQueryBridge audience={audience} />
      <HyperlabPageShell
        title={audience?.name ?? intl.formatMessage(messages.audiencesTitle)}
        description={intl.formatMessage(messages.audiencesDescription)}
        backHref={`/org/${organizationSlug}/hyperlab/audiences`}
      >
        <Rows spacing="2u">
          {detailQuery.isError ? (
            <HyperlabLoadError
              error={detailQuery.error}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : null}
          {audience ? (
            <Card className={audienceStore.isDirty ? "ring-foreground/40" : undefined}>
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
                        value={audienceStore.name}
                        onChange={(event) => audienceStore.setName(event.target.value)}
                        disabled={!canWrite}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="hyperlab-audience-note">
                        <FormattedMessage {...messages.audienceDescriptionLabel} />
                      </FieldLabel>
                      <Textarea
                        id="hyperlab-audience-note"
                        value={audienceStore.description}
                        onChange={(event) => audienceStore.setDescription(event.target.value)}
                        rows={3}
                        disabled={!canWrite}
                      />
                    </Field>
                  </FieldGroup>
                  <TypographyP size="small" tone="subtle">
                    <FormattedMessage {...messages.audienceRulesHint} />
                  </TypographyP>
                  <HyperlabCriterionBuilder
                    group={audienceStore.group}
                    onChange={(group) => audienceStore.setGroup(group)}
                    disabled={!canWrite}
                  />
                </Rows>
              </CardContent>
              {canWrite ? (
                <CardFooter className="gap-3">
                  <Button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !audienceStore.isDirty}
                  >
                    {saveMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                    <FormattedMessage
                      {...(saveMutation.isPending ? messages.saving : messages.save)}
                    />
                  </Button>
                  {audienceStore.isDirty ? (
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
    </>
  );
});
