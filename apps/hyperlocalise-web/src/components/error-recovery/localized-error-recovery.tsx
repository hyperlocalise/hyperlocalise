"use client";

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
