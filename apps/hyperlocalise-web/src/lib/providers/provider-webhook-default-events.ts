import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

/**
 * Returns the default event list stored on new subscriptions. HL-402 does not
 * define provider event semantics, so this stays empty until the provider event
 * mapping contract and concrete provider setup tickets choose event names.
 */
export function listDefaultWebhookEvents(_providerKind: ExternalTmsProviderKind) {
  return [];
}
