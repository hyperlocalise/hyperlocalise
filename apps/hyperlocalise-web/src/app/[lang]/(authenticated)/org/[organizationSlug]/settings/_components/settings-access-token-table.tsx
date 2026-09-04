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
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import type { AccessTokenSummary } from "./access-token-lifecycle";
import { formatAccessTokenDate } from "./access-token-lifecycle";
import { settingsAccessTokenTableMessages as messages } from "./settings-access-token-table.messages";

const TABLE_GRID =
  "md:grid-cols-[minmax(7rem,1.1fr)_minmax(10.5rem,auto)_minmax(0,1.6fr)_7.5rem_auto]";

function TableHeaderCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="columnheader"
      className={cn("text-xs font-medium text-muted-foreground uppercase", className)}
    >
      {children}
    </div>
  );
}

function MobileColumnLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground uppercase md:hidden">
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
    <div role="table" className="min-w-0">
      <div
        role="row"
        className={cn("hidden gap-4 px-1 py-2.5 md:grid md:items-center", TABLE_GRID)}
      >
        <TableHeaderCell>
          <FormattedMessage {...messages.columnName} />
        </TableHeaderCell>
        <TableHeaderCell>
          <FormattedMessage {...messages.columnPrefix} />
        </TableHeaderCell>
        <TableHeaderCell>
          <FormattedMessage {...messages.columnPermissions} />
        </TableHeaderCell>
        <TableHeaderCell>
          <FormattedMessage {...messages.columnLastUsed} />
        </TableHeaderCell>
        <TableHeaderCell className="sr-only">{revokeLabel}</TableHeaderCell>
      </div>
      {tokens.map((token) => (
        <div
          key={token.id}
          role="row"
          className={cn(
            "grid gap-3 border-t border-border px-1 py-4 md:items-center md:gap-4",
            TABLE_GRID,
          )}
        >
          <div role="cell" className="min-w-0">
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
          </div>
          <div role="cell" className="min-w-0">
            <div className="flex items-center justify-between gap-3 md:block">
              <MobileColumnLabel>
                <FormattedMessage {...messages.columnPrefix} />
              </MobileColumnLabel>
              <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                <FormattedMessage
                  {...messages.startsWithPrefix}
                  values={{ prefix: token.keyPrefix }}
                />
              </span>
            </div>
          </div>
          <div role="cell" className="min-w-0">
            <div className="flex items-start justify-between gap-3 md:block">
              <MobileColumnLabel>
                <FormattedMessage {...messages.columnPermissions} />
              </MobileColumnLabel>
              <p className="min-w-0 text-pretty font-mono text-xs break-words text-muted-foreground">
                {token.permissions.join(", ")}
              </p>
            </div>
          </div>
          <div role="cell" className="min-w-0">
            <div className="flex items-center justify-between gap-3 md:block">
              <MobileColumnLabel>
                <FormattedMessage {...messages.columnLastUsed} />
              </MobileColumnLabel>
              <TypographyP
                className="leading-tight whitespace-nowrap tabular-nums"
                size="small"
                tone="subtle"
              >
                {formatAccessTokenDate(intl, token.lastUsedAt, neverUsedLabel)}
              </TypographyP>
            </div>
          </div>
          <div role="cell" className="flex items-center justify-end">
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
          </div>
        </div>
      ))}
    </div>
  );
}
