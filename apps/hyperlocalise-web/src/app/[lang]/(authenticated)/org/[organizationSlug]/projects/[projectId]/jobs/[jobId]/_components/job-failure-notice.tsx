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
import type { ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  formatJobFailureReason,
  type JobFailureDetails,
} from "@/lib/projects/jobs/job-failure-details";

import { jobFailureCodeMessage } from "./job-failure-code";
import { jobFailureCodeMessages } from "./job-failure-code.messages";
import { jobFailureNoticeMessages as messages } from "./job-failure-notice.messages";

/**
 * One place that says why a job failed and what to do next. The workflow's
 * recorded message comes first; a known failure code fills in when none was recorded.
 */
export function JobFailureNotice({
  details,
  followUpHref,
  variant,
  action,
}: {
  details: JobFailureDetails;
  followUpHref?: string | null;
  variant: "failed" | "partial";
  /** The next step, such as a Retry button. */
  action?: ReactNode;
}) {
  const intl = useIntl();
  const recorded = details.reason ? formatJobFailureReason(details.reason) : null;
  const codeMessage = jobFailureCodeMessage(details.code);
  const headline = recorded ?? intl.formatMessage(codeMessage ?? jobFailureCodeMessages.noReason);

  return (
    <Alert variant={variant === "failed" ? "destructive" : "default"}>
      <WarningCircleIcon />
      <AlertTitle>
        <FormattedMessage
          {...(variant === "failed" ? messages.failedTitle : messages.partialTitle)}
        />
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p className="text-foreground">{headline}</p>
        {details.failedLocales.length > 0 ? (
          <p>
            <FormattedMessage
              {...messages.failedLocales}
              values={{ locales: details.failedLocales.join(", ") }}
            />
          </p>
        ) : null}
        {details.code ? (
          <details className="text-xs">
            <summary className="w-fit cursor-pointer">
              <FormattedMessage {...messages.technicalDetails} />
            </summary>
            <code className="mt-1 block break-all">{details.code}</code>
          </details>
        ) : null}
        {action || (followUpHref && details.followUpJobId) ? (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {action}
            {followUpHref && details.followUpJobId ? (
              <Link href={followUpHref} className="text-sm underline underline-offset-4">
                <FormattedMessage {...messages.followUpLink} />
              </Link>
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
