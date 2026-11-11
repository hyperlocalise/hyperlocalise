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
import { WarningCircleIcon } from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  formatJobFailureReason,
  type JobFailureDetails,
} from "@/lib/projects/jobs/job-failure-details";

import { jobFailureNoticeMessages as messages } from "./job-failure-notice.messages";

export function JobFailureNotice({
  details,
  followUpHref,
  variant,
}: {
  details: JobFailureDetails;
  followUpHref?: string | null;
  variant: "failed" | "partial";
}) {
  const reason = details.reason ? formatJobFailureReason(details.reason) : null;

  return (
    <Alert variant={variant === "failed" ? "destructive" : "default"}>
      <WarningCircleIcon />
      <AlertTitle>
        <FormattedMessage
          {...(variant === "failed" ? messages.failedTitle : messages.partialTitle)}
        />
      </AlertTitle>
      <AlertDescription>
        {reason ? <p>{reason}</p> : null}
        {details.failedLocales.length > 0 ? (
          <p>
            <FormattedMessage
              {...messages.failedLocales}
              values={{ locales: details.failedLocales.join(", ") }}
            />
          </p>
        ) : null}
        {followUpHref && details.followUpJobId ? (
          <p>
            <Link href={followUpHref}>
              <FormattedMessage {...messages.followUpLink} />
            </Link>
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
