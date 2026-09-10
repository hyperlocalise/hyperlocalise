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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabAudience,
  type HyperlabExperiment,
  type HyperlabFlag,
} from "./hyperlab-api";
import { HyperlabPageShell } from "./hyperlab-page-shell";
import { HyperlabLoadError } from "./hyperlab-ui";

function countLabel(intl: ReturnType<typeof useIntl>, count: number | undefined) {
  if (!count) {
    return intl.formatMessage(messages.homeEmptyCount);
  }
  return intl.formatMessage(messages.homeCount, { count });
}

export function HyperlabOverview({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const baseUrl = `${origin}/api/go-svc`;
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

  const snippet = `import { OpenFeature } from "@openfeature/server-sdk";
import { OFREPProvider } from "@openfeature/ofrep-provider";

OpenFeature.setProvider(
  new OFREPProvider({
    baseUrl: "${baseUrl || "https://app.example.com/api/go-svc"}",
    headers: [["X-API-Key", "hlk_..."]],
  }),
);`;

  const cards = [
    {
      href: `/org/${organizationSlug}/hyperlab/experiments`,
      title: messages.homeExperimentsTitle,
      body: messages.homeExperimentsBody,
      count: experimentsQuery.data?.length,
    },
    {
      href: `/org/${organizationSlug}/hyperlab/audiences`,
      title: messages.homeAudiencesTitle,
      body: messages.homeAudiencesBody,
      count: audiencesQuery.data?.length,
    },
    {
      href: `/org/${organizationSlug}/hyperlab/flags`,
      title: messages.homeFlagsTitle,
      body: messages.homeFlagsBody,
      count: flagsQuery.data?.length,
    },
    {
      href: `/org/${organizationSlug}/hyperlab/keys`,
      title: messages.homeConnectionTitle,
      body: messages.homeConnectionBody,
    },
  ] as const;

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="overview"
      title={intl.formatMessage(messages.overviewTitle)}
      description={intl.formatMessage(messages.overviewDescription)}
    >
      <Rows spacing="3u">
        {experimentsQuery.isError ? (
          <HyperlabLoadError
            error={experimentsQuery.error}
            onRetry={() => void experimentsQuery.refetch()}
          />
        ) : null}
        <Columns spacing="2u" collapseBelow="large">
          {cards.map((card) => (
            <Column key={card.href} width="1/2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>
                    <FormattedMessage {...card.title} />
                  </CardTitle>
                  <CardDescription>
                    <FormattedMessage {...card.body} />
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  {"count" in card ? (
                    <TypographyP size="small" tone="subtle">
                      {countLabel(intl, card.count)}
                    </TypographyP>
                  ) : (
                    <span />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={card.href} />}
                  >
                    <FormattedMessage {...messages.openHomeCard} />
                  </Button>
                </CardContent>
              </Card>
            </Column>
          ))}
        </Columns>
        <Card>
          <CardHeader>
            <CardTitle>
              <FormattedMessage {...messages.howItWorksTitle} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3 text-sm text-muted-foreground">
              <li>
                1. <FormattedMessage {...messages.howItWorksStep1} />
              </li>
              <li>
                2. <FormattedMessage {...messages.howItWorksStep2} />
              </li>
              <li>
                3. <FormattedMessage {...messages.howItWorksStep3} />
              </li>
              <li>
                4. <FormattedMessage {...messages.howItWorksStep4} />
              </li>
            </ol>
          </CardContent>
        </Card>
        <Collapsible>
          <CollapsibleTrigger
            render={<Button type="button" variant="ghost" className="w-fit px-0" />}
          >
            <FormattedMessage {...messages.developerDetailsTitle} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3">
              <Columns spacing="2u" collapseBelow="large">
                <Column width="1/2">
                  <Rows spacing="1.5u">
                    <TypographyP weight="medium">
                      <FormattedMessage {...messages.ofrepTitle} />
                    </TypographyP>
                    <TypographyP wrapStyle="pretty" size="small" tone="subtle">
                      <FormattedMessage {...messages.ofrepHint} />
                    </TypographyP>
                    <Box
                      border="standard"
                      borderRadius="standard"
                      background="muted"
                      paddingX="1.5u"
                      paddingY="1u"
                    >
                      <code className="text-sm">{baseUrl || "/api/go-svc"}</code>
                    </Box>
                  </Rows>
                </Column>
                <Column width="1/2">
                  <Rows spacing="1.5u">
                    <TypographyP weight="medium">
                      <FormattedMessage {...messages.snippetTitle} />
                    </TypographyP>
                    <Box
                      border="standard"
                      borderRadius="standard"
                      background="muted"
                      paddingX="1.5u"
                      paddingY="1u"
                    >
                      <pre className="overflow-x-auto text-xs leading-5">
                        <code>{snippet}</code>
                      </pre>
                    </Box>
                  </Rows>
                </Column>
              </Columns>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Rows>
    </HyperlabPageShell>
  );
}
