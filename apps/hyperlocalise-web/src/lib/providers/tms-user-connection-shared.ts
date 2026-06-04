import { isApiResponseErrorCode } from "@/lib/api-error";

/** Providers that require a per-user OAuth link in addition to the org integration. */
export type TmsUserConnectProviderKind = "crowdin";

export type TmsUserConnectCta =
  | { showConnectCta: false }
  | {
      showConnectCta: true;
      providerKind: TmsUserConnectProviderKind;
      providerDisplayName: string;
    };

const DEFAULT_PROVIDER_LABELS: Record<TmsUserConnectProviderKind, string> = {
  crowdin: "Crowdin",
};

export function formatTmsUserConnectProviderLabel(providerKind: TmsUserConnectProviderKind) {
  return DEFAULT_PROVIDER_LABELS[providerKind];
}

export function tmsUserConnectionRequiredMessage(
  providerKind: TmsUserConnectProviderKind,
  resource: "projects" | "jobs" | "files",
) {
  const label = formatTmsUserConnectProviderLabel(providerKind);
  return `Connect ${label} to view provider ${resource}.`;
}

/** API error codes that mean the active TMS needs a per-user account link. */
export function isTmsUserConnectionRequiredError(error: unknown) {
  return isApiResponseErrorCode(error, "crowdin_user_connection_required");
}
