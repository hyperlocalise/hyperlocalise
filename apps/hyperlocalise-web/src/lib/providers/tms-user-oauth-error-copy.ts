export type TmsUserOAuthErrorCopy = {
  title: string;
  description: string;
};

export const tmsUserOAuthErrorCopyByCode = {
  crowdin_user_oauth_exchange_failed: {
    title: "Crowdin account link failed",
    description:
      "Crowdin did not return an access token. Check that the OAuth app callback URL, client ID, client secret, and app type match the Crowdin OAuth App configuration.",
  },
  crowdin_user_oauth_invalid: {
    title: "Crowdin account link failed",
    description:
      "Crowdin returned an access token, but the Crowdin API rejected it when loading your profile. Try connecting again. If it keeps failing, verify the OAuth app client ID and secret in Integrations.",
  },
  crowdin_user_oauth_enterprise_mismatch: {
    title: "Crowdin Enterprise account link failed",
    description:
      "Crowdin returned an access token, but your Enterprise API rejected it when loading your profile. Create the OAuth app under Organization Settings → OAuth Apps in your Enterprise workspace (yourorg.crowdin.com), use that app's client ID and secret in Integrations, and when authorizing sign in with your Enterprise account—not a personal crowdin.com account.",
  },
  crowdin_user_lookup_failed: {
    title: "Crowdin account link failed",
    description:
      "Hyperlocalise received a token but could not load the authorized Crowdin user. Try connecting again, or ask an admin to verify the integration base URL and OAuth app settings.",
  },
  crowdin_integration_not_connected: {
    title: "Crowdin integration is not connected",
    description: "Save the Crowdin OAuth app credentials before linking a user account.",
  },
  crowdin_user_already_linked: {
    title: "Crowdin account already linked",
    description:
      "That Crowdin user is already linked to another Hyperlocalise user in this workspace.",
  },
  missing_crowdin_user_oauth_code: {
    title: "Crowdin account link was cancelled",
    description: "Crowdin did not return an authorization code. Start the connection again.",
  },
  invalid_crowdin_oauth_state: {
    title: "Crowdin account link expired",
    description: "This Crowdin connection link expired. Start Connect Crowdin again.",
  },
  phrase_user_oauth_exchange_failed: {
    title: "Phrase account link failed",
    description:
      "Phrase did not return an access token. Check that the OAuth app callback URL, client ID, and client secret match the Phrase OAuth App configuration.",
  },
  phrase_user_oauth_invalid: {
    title: "Phrase account link failed",
    description:
      "Phrase rejected the access token returned during authorization. Try connecting again.",
  },
  phrase_user_lookup_failed: {
    title: "Phrase account link failed",
    description: "Hyperlocalise received a token but could not load the authorized Phrase user.",
  },
  phrase_integration_not_connected: {
    title: "Phrase integration is not connected",
    description: "Save the Phrase OAuth app credentials before linking a user account.",
  },
  phrase_user_already_linked: {
    title: "Phrase account already linked",
    description:
      "That Phrase user is already linked to another Hyperlocalise user in this workspace.",
  },
  missing_phrase_user_oauth_code: {
    title: "Phrase account link was cancelled",
    description: "Phrase did not return an authorization code. Start the connection again.",
  },
  invalid_phrase_oauth_state: {
    title: "Phrase account link expired",
    description: "This Phrase connection link expired. Start Connect Phrase again.",
  },
  lokalise_user_oauth_exchange_failed: {
    title: "Lokalise account link failed",
    description:
      "Lokalise could not exchange the authorization code. Check the OAuth callback URL in your Lokalise app settings.",
  },
  lokalise_user_oauth_invalid: {
    title: "Lokalise account link failed",
    description: "Lokalise rejected the connection. Try connecting again.",
  },
  lokalise_user_lookup_failed: {
    title: "Lokalise account link failed",
    description: "Lokalise connected, but Hyperlocalise could not load your profile.",
  },
  lokalise_user_no_projects: {
    title: "Lokalise account link failed",
    description:
      "Lokalise authorized your account, but you need access to at least one project before linking.",
  },
  lokalise_integration_not_connected: {
    title: "Lokalise integration is not connected",
    description: "Connect the Lokalise integration in Integrations before linking your account.",
  },
  lokalise_user_already_linked: {
    title: "Lokalise account already linked",
    description: "This Lokalise account is already linked to another member in this workspace.",
  },
  missing_lokalise_user_oauth_code: {
    title: "Lokalise account link was cancelled",
    description: "Lokalise did not return an authorization code. Start the connection again.",
  },
  invalid_lokalise_oauth_state: {
    title: "Lokalise account link expired",
    description: "This Lokalise connection link expired. Start Connect Lokalise again.",
  },
} satisfies Record<string, TmsUserOAuthErrorCopy>;

export type TmsUserOAuthErrorCode = keyof typeof tmsUserOAuthErrorCopyByCode;

export function isTmsUserOAuthErrorCode(errorCode: string): errorCode is TmsUserOAuthErrorCode {
  return errorCode in tmsUserOAuthErrorCopyByCode;
}

export function getTmsUserOAuthErrorCopy(
  errorCode: string | null | undefined,
): TmsUserOAuthErrorCopy | null {
  if (!errorCode || !isTmsUserOAuthErrorCode(errorCode)) {
    return null;
  }

  return tmsUserOAuthErrorCopyByCode[errorCode];
}
