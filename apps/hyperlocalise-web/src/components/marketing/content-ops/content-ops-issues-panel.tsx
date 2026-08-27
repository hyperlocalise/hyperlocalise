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

import { cn } from "@/lib/primitives/cn";

import { CONTENT_OPS_MOCK_INNER_CLASSNAME } from "./content-ops-mock-stage.constants";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

type IssueRow = {
  id: string;
  identifier: string;
  title: string;
  detail: string;
  locale: string;
  statusKey: "statusOpen" | "statusInProgress" | "statusResolved";
  highlighted?: boolean;
};

export function ContentOpsIssuesPanel({ highlightedIndex = 1 }: { highlightedIndex?: number }) {
  const intl = useIntl();

  const rows: IssueRow[] = [
    {
      id: "web-2",
      identifier: "WEB-2",
      title: intl.formatMessage(contentOpsMockStageMessages.issueWeb2Title),
      detail: intl.formatMessage(contentOpsMockStageMessages.issueWeb2Detail),
      locale: "fr-FR",
      statusKey: "statusInProgress",
    },
    {
      id: "mob-1",
      identifier: "MOB-1",
      title: intl.formatMessage(contentOpsMockStageMessages.issueMob1Title),
      detail: intl.formatMessage(contentOpsMockStageMessages.issueMob1Detail),
      locale: "es-ES",
      statusKey: "statusOpen",
    },
    {
      id: "web-3",
      identifier: "WEB-3",
      title: intl.formatMessage(contentOpsMockStageMessages.issueWeb3Title),
      detail: intl.formatMessage(contentOpsMockStageMessages.issueWeb3Detail),
      locale: "de-DE",
      statusKey: "statusResolved",
    },
  ];

  return (
    <div className={CONTENT_OPS_MOCK_INNER_CLASSNAME}>
      <div className="border-b border-border/50 px-5 py-4">
        <div className="text-base font-semibold text-foreground">
          <FormattedMessage {...contentOpsMockStageMessages.issuesTitle} />
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center divide-y divide-border/40">
        {rows.map((row, index) => {
          const highlighted = index === highlightedIndex;
          return (
            <div
              key={row.id}
              className={cn(
                "flex items-start gap-3 px-5 py-5 transition-colors",
                highlighted && "bg-primary/5",
              )}
            >
              <div
                className={cn(
                  "mt-1 w-0.5 self-stretch rounded-full",
                  highlighted ? "bg-primary" : "bg-transparent",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] font-medium text-muted-foreground">
                    {row.identifier}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {row.locale}
                  </span>
                  <span
                    className={cn(
                      "ms-auto text-[10px] font-medium",
                      row.statusKey === "statusResolved"
                        ? "text-emerald-600"
                        : row.statusKey === "statusInProgress"
                          ? "text-primary"
                          : "text-amber-700",
                    )}
                  >
                    <FormattedMessage {...contentOpsMockStageMessages[row.statusKey]} />
                  </span>
                </div>
                <p className="mt-1.5 text-base font-medium leading-snug text-foreground">
                  {row.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.detail}</p>
                {highlighted ? (
                  <p className="mt-2 text-xs font-medium text-primary">
                    <FormattedMessage {...contentOpsMockStageMessages.openInCat} />
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
