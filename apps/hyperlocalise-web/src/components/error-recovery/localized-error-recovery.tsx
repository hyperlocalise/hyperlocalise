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
import { useIntl } from "react-intl";

import { ErrorRecovery } from "@/components/error-recovery/error-recovery";
import { errorRecoveryMessages } from "@/components/error-recovery/error-recovery.messages";

type LocalizedErrorRecoveryProps = {
  dashboardHref: string;
  retry: () => void;
  fullPage?: boolean;
};

export function LocalizedErrorRecovery({
  dashboardHref,
  retry,
  fullPage,
}: LocalizedErrorRecoveryProps) {
  const intl = useIntl();

  return (
    <ErrorRecovery
      title={intl.formatMessage(errorRecoveryMessages.title)}
      description={intl.formatMessage(errorRecoveryMessages.description)}
      tryAgainLabel={intl.formatMessage(errorRecoveryMessages.tryAgain)}
      dashboardLabel={intl.formatMessage(errorRecoveryMessages.goToDashboard)}
      supportLabel={intl.formatMessage(errorRecoveryMessages.contactSupport)}
      dashboardHref={dashboardHref}
      retry={retry}
      fullPage={fullPage}
    />
  );
}
