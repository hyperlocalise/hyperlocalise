import { isApiResponseErrorCode } from "@/lib/api-error";

/** Providers that require a per-user OAuth link in addition to the org integration. */
export type TmsUserConnectProviderKind = "crowdin" | "phrase" | "lokalise";

export type TmsUserConnectCta =
  | { showConnectCta: false }
  | {
      showConnectCta: true;
      providerKind: TmsUserConnectProviderKind;
      providerDisplayName: string;
      connectMethod: "oauth" | "pat";
    };

const DEFAULT_PROVIDER_LABELS: Record<TmsUserConnectProviderKind, string> = {
  crowdin: "Crowdin",
  phrase: "Phrase",
  lokalise: "Lokalise",
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
  return (
    isApiResponseErrorCode(error, "crowdin_user_connection_required") ||
    isApiResponseErrorCode(error, "crowdin_user_connection_auth_mode_mismatch") ||
    isApiResponseErrorCode(error, "phrase_user_connection_required") ||
    isApiResponseErrorCode(error, "lokalise_user_connection_required")
  );
}
