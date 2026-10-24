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
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useIntl } from "react-intl";

import { ErrorRecovery } from "@/components/error-recovery/error-recovery";
import { errorRecoveryMessages } from "@/components/error-recovery/error-recovery.messages";

import { localisationAuditResultRouteErrorMessages as messages } from "./error.messages";

type LocalisationAuditResultErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function LocalisationAuditResultError({
  error,
  unstable_retry,
}: LocalisationAuditResultErrorProps) {
  const { lang } = useParams<{ lang: string }>();
  const intl = useIntl();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorRecovery
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      tryAgainLabel={intl.formatMessage(errorRecoveryMessages.tryAgain)}
      dashboardLabel={intl.formatMessage(messages.backToAudits)}
      supportLabel={intl.formatMessage(errorRecoveryMessages.contactSupport)}
      dashboardHref={`/${lang}/localisation-audit`}
      retry={unstable_retry}
    />
  );
}
