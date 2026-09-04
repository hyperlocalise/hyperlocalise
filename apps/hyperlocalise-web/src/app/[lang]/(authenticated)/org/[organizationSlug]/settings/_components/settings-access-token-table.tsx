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
import type { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";

import type { AccessTokenSummary } from "./access-token-lifecycle";
import { formatAccessTokenDate } from "./access-token-lifecycle";
import { settingsAccessTokenTableMessages as messages } from "./settings-access-token-table.messages";

function TableHeaderCell({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  );
}

export function SettingsAccessTokenTable({
  tokens,
  canRevoke,
  neverUsedLabel,
  revokedLabel,
  revokeLabel,
  onRevoke,
  revokePending,
}: {
  tokens: readonly AccessTokenSummary[];
  canRevoke: boolean;
  neverUsedLabel: string;
  revokedLabel: string;
  revokeLabel: string;
  onRevoke: (token: AccessTokenSummary) => void;
  revokePending: boolean;
}) {
  const intl = useIntl();

  return (
    <Rows spacing="0" role="table">
      <Columns spacing="2u" alignY="center" collapseBelow="medium" role="row">
        <Column width="3/12" role="columnheader">
          <TableHeaderCell>
            <FormattedMessage {...messages.columnName} />
          </TableHeaderCell>
        </Column>
        <Column width="2/12" role="columnheader">
          <TableHeaderCell>
            <FormattedMessage {...messages.columnPrefix} />
          </TableHeaderCell>
        </Column>
        <Column width="4/12" role="columnheader">
          <TableHeaderCell>
            <FormattedMessage {...messages.columnPermissions} />
          </TableHeaderCell>
        </Column>
        <Column width="2/12" role="columnheader">
          <TableHeaderCell>
            <FormattedMessage {...messages.columnLastUsed} />
          </TableHeaderCell>
        </Column>
        <Column width="content" role="columnheader">
          <span className="sr-only">{revokeLabel}</span>
        </Column>
      </Columns>
      <Separator />
      {tokens.map((token) => (
        <Rows key={token.id} spacing="0">
          <Columns spacing="2u" alignY="center" collapseBelow="medium" role="row">
            <Column width="3/12" role="cell">
              <Rows spacing="0.5u">
                <TypographyP
                  className="leading-tight"
                  lineClamp={1}
                  size="small"
                  weight="medium"
                  tone="content"
                >
                  {token.name}
                </TypographyP>
                {token.revokedAt ? <Badge variant="outline">{revokedLabel}</Badge> : null}
              </Rows>
            </Column>
            <Column width="2/12" role="cell">
              <span className="font-mono text-xs text-muted-foreground">
                <FormattedMessage
                  {...messages.startsWithPrefix}
                  values={{ prefix: token.keyPrefix }}
                />
              </span>
            </Column>
            <Column width="4/12" role="cell">
              <span className="truncate font-mono text-sm text-muted-foreground">
                {token.permissions.join(", ")}
              </span>
            </Column>
            <Column width="2/12" role="cell">
              <TypographyP className="leading-tight" size="small" tone="subtle">
                {formatAccessTokenDate(intl, token.lastUsedAt, neverUsedLabel)}
              </TypographyP>
            </Column>
            <Column width="content" role="cell">
              {canRevoke && !token.revokedAt ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onRevoke(token)}
                  disabled={revokePending}
                >
                  {revokeLabel}
                </Button>
              ) : null}
            </Column>
          </Columns>
          <Separator />
        </Rows>
      ))}
    </Rows>
  );
}
