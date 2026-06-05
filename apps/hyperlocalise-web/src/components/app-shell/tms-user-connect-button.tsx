"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";
import {
  formatTmsUserConnectProviderLabel,
  type TmsUserConnectProviderKind,
} from "@/lib/providers/tms-user-connection-shared";

const TMS_USER_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  crowdin_user_oauth_exchange_failed:
    "Crowdin could not exchange the authorization code. Check the OAuth callback URL in your Crowdin app settings.",
  crowdin_user_oauth_invalid: "Crowdin rejected the connection. Try connecting again.",
  crowdin_user_lookup_failed: "Crowdin connected, but Hyperlocalise could not load your profile.",
  crowdin_user_already_linked:
    "This Crowdin account is already linked to another member in this workspace.",
  invalid_crowdin_oauth_state: "This Crowdin connection link expired. Start Connect Crowdin again.",
  missing_crowdin_user_oauth_code: "Crowdin did not return an authorization code.",
  crowdin_integration_not_connected:
    "Connect the Crowdin integration in Integrations before linking your account.",
  phrase_user_oauth_exchange_failed:
    "Phrase could not exchange the authorization code. Check the OAuth callback URL in your Phrase app settings.",
  phrase_user_oauth_invalid: "Phrase rejected the connection. Try connecting again.",
  phrase_user_lookup_failed: "Phrase connected, but Hyperlocalise could not load your profile.",
  phrase_user_already_linked:
    "This Phrase account is already linked to another member in this workspace.",
  invalid_phrase_oauth_state: "This Phrase connection link expired. Start Connect Phrase again.",
  missing_phrase_user_oauth_code: "Phrase did not return an authorization code.",
  phrase_integration_not_connected:
    "Connect the Phrase integration in Integrations before linking your account.",
};

export function TmsUserConnectButton({
  organizationSlug,
  providerKind,
  providerDisplayName,
  className,
}: {
  organizationSlug: string;
  providerKind: TmsUserConnectProviderKind;
  providerDisplayName?: string;
  className?: string;
}) {
  const label = providerDisplayName ?? formatTmsUserConnectProviderLabel(providerKind);
  const [isPending, setIsPending] = useState(false);
  const searchParams = useSearchParams();
  const handledOAuthErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode || !TMS_USER_OAUTH_ERROR_MESSAGES[errorCode]) {
      return;
    }
    if (handledOAuthErrorRef.current === errorCode) {
      return;
    }
    handledOAuthErrorRef.current = errorCode;

    toast.error(TMS_USER_OAUTH_ERROR_MESSAGES[errorCode]);

    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
  }, [providerKind, searchParams]);

  async function handleConnect() {
    if (isPending) return;

    setIsPending(true);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const route =
        providerKind === "phrase"
          ? apiClient.api.orgs[":organizationSlug"]["external-tms-provider-credential"].phrase.user
              .oauth.start
          : apiClient.api.orgs[":organizationSlug"]["external-tms-provider-credential"].crowdin.user
              .oauth.start;
      const response = await route.$post({
        param: { organizationSlug },
        json: { returnTo },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(body?.message ?? body?.error ?? `Failed to start ${label} connection`);
      }

      const body = (await response.json()) as { authorizationUrl: string };
      window.location.assign(body.authorizationUrl);
    } catch (error) {
      setIsPending(false);
      toast.error(error instanceof Error ? error.message : `Failed to start ${label} connection`);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("hidden sm:inline-flex", className)}
      disabled={isPending}
      onClick={handleConnect}
    >
      <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-4" />
      {isPending ? "Connecting..." : `Connect ${label}`}
    </Button>
  );
}
