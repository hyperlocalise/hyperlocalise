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
import { FormattedMessage, useIntl } from "react-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import { HyperlabPageShell } from "./hyperlab-page-shell";

export function HyperlabOverview({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const baseUrl = `${origin}/api/go-svc`;
  const snippet = `import { OpenFeature } from "@openfeature/server-sdk";
import { OFREPProvider } from "@openfeature/ofrep-provider";

OpenFeature.setProvider(
  new OFREPProvider({
    baseUrl: "${baseUrl || "https://app.example.com/api/go-svc"}",
    headers: [["X-API-Key", "hlk_..."]],
  }),
);`;

  return (
    <HyperlabPageShell
      organizationSlug={organizationSlug}
      section="overview"
      title={intl.formatMessage(messages.overviewTitle)}
      description={intl.formatMessage(messages.overviewDescription)}
    >
      <Columns spacing="2u" collapseBelow="large">
        <Column width="1/2">
          <Card>
            <CardHeader>
              <CardTitle>
                <FormattedMessage {...messages.ofrepTitle} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Rows spacing="1.5u">
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
            </CardContent>
          </Card>
        </Column>
        <Column width="1/2">
          <Card>
            <CardHeader>
              <CardTitle>
                <FormattedMessage {...messages.snippetTitle} />
              </CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </Column>
      </Columns>
    </HyperlabPageShell>
  );
}
