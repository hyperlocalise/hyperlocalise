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
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  readHyperlabJson,
  type HyperlabAssignment,
  type HyperlabFlag,
  type HyperlabFlagConfig,
} from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";

export function HyperlabFlagDetail({
  organizationSlug,
  flagId,
  canWrite,
}: {
  organizationSlug: string;
  flagId: string;
  canWrite: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const [description, setDescription] = useState("");
  const [configText, setConfigText] = useState("{}");
  const [variantId, setVariantId] = useState("");

  const detailQuery = useQuery({
    queryKey: ["hyperlab-flag", organizationSlug, flagId],
    queryFn: async () => {
      const response = await client.flags[":flagId"].$get({
        param: { organizationSlug, flagId },
      });
      return readHyperlabJson<{ flag: HyperlabFlag; config: HyperlabFlagConfig }>(
        response,
        intl.formatMessage(messages.loadError),
      );
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ["hyperlab-assignments", organizationSlug],
    queryFn: async () => {
      const response = await client.assignments.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ assignments: HyperlabAssignment[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.assignments.filter((assignment) => assignment.flagId === flagId);
    },
  });

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }
    setDescription(detailQuery.data.flag.description ?? "");
    if (detailQuery.data.config.value !== null && detailQuery.data.config.value !== undefined) {
      setConfigText(JSON.stringify(detailQuery.data.config.value, null, 2));
    }
  }, [detailQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await client.flags[":flagId"].$put({
        param: { organizationSlug, flagId },
        json: { description },
      });
      await readHyperlabJson(response, intl.formatMessage(messages.loadError));
      if (detailQuery.data?.flag.kind === "config") {
        const configResponse = await client.flags[":flagId"].config.$put({
          param: { organizationSlug, flagId },
          json: { value: JSON.parse(configText) as unknown },
        });
        await readHyperlabJson(configResponse, intl.formatMessage(messages.loadError));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hyperlab-flag", organizationSlug, flagId] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const response = await client.assignments.$post({
        param: { organizationSlug },
        json: { flagId, variantId, enabled: true },
      });
      return readHyperlabJson(response, intl.formatMessage(messages.loadError));
    },
    onSuccess: async () => {
      setVariantId("");
      await queryClient.invalidateQueries({ queryKey: ["hyperlab-assignments", organizationSlug] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await client.flags[":flagId"].$delete({
        param: { organizationSlug, flagId },
      });
      if (!response.ok && response.status !== 204) {
        await readHyperlabJson(response, intl.formatMessage(messages.loadError));
      }
    },
    onSuccess: () => {
      router.push(`/org/${organizationSlug}/hyperlab/flags`);
    },
  });

  const flag = detailQuery.data?.flag;

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="flags"
      title={flag?.key ?? intl.formatMessage(messages.flagsTitle)}
      description={intl.formatMessage(messages.flagsDescription)}
      actions={
        canWrite ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <FormattedMessage {...messages.delete} />
          </Button>
        ) : null
      }
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
        {flag ? (
          <Rows spacing="2u">
            <Field>
              <FieldLabel htmlFor="hyperlab-flag-description">
                <FormattedMessage {...messages.flagDescriptionLabel} />
              </FieldLabel>
              <Input
                id="hyperlab-flag-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canWrite}
              />
            </Field>
            {flag.kind === "config" ? (
              <Field>
                <FieldLabel htmlFor="hyperlab-flag-config">
                  <FormattedMessage {...messages.configJsonLabel} />
                </FieldLabel>
                <Textarea
                  id="hyperlab-flag-config"
                  value={configText}
                  onChange={(event) => setConfigText(event.target.value)}
                  rows={8}
                  disabled={!canWrite}
                />
              </Field>
            ) : null}
            {canWrite ? (
              <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <FormattedMessage {...messages.save} />
              </Button>
            ) : null}

            <Rows spacing="1.5u">
              <h2 className="text-sm font-medium">
                <FormattedMessage {...messages.assignmentsTitle} />
              </h2>
              {canWrite ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    assignMutation.mutate();
                  }}
                >
                  <Columns spacing="1.5u" alignY="end" collapseBelow="small">
                    <Column width="fluid">
                      <Field>
                        <FieldLabel htmlFor="hyperlab-variant-id">
                          <FormattedMessage {...messages.variantIdLabel} />
                        </FieldLabel>
                        <Input
                          id="hyperlab-variant-id"
                          value={variantId}
                          onChange={(event) => setVariantId(event.target.value)}
                          required
                        />
                      </Field>
                    </Column>
                    <Column width="content">
                      <Button type="submit" disabled={!variantId || assignMutation.isPending}>
                        <FormattedMessage {...messages.attachVariant} />
                      </Button>
                    </Column>
                  </Columns>
                </form>
              ) : null}
              <Box border="standard" borderRadius="standard">
                <Rows spacing="0">
                  {(assignmentsQuery.data ?? []).map((assignment) => (
                    <Box key={assignment.id} paddingX="2u" paddingY="1.5u">
                      <TypographyP className="text-sm">
                        {assignment.variantId} · {assignment.enabled ? "on" : "off"}
                      </TypographyP>
                    </Box>
                  ))}
                </Rows>
              </Box>
            </Rows>
          </Rows>
        ) : null}
      </Rows>
    </HyperlabPageShell>
  );
}
