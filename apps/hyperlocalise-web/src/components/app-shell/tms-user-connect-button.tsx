"use client";

import { useState } from "react";
import { Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { CrowdinUserPatConnectDialog } from "@/components/app-shell/crowdin-user-pat-connect-dialog";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";
import {
  formatTmsUserConnectProviderLabel,
  type TmsUserConnectProviderKind,
} from "@/lib/providers/tms-user-connection-shared";

export function TmsUserConnectButton({
  organizationSlug,
  providerKind,
  providerDisplayName,
  connectMethod = "oauth",
  className,
}: {
  organizationSlug: string;
  providerKind: TmsUserConnectProviderKind;
  providerDisplayName?: string;
  connectMethod?: "oauth" | "pat";
  className?: string;
}) {
  const label = providerDisplayName ?? formatTmsUserConnectProviderLabel(providerKind);
  const [isPending, setIsPending] = useState(false);
  const [patDialogOpen, setPatDialogOpen] = useState(false);

  async function handleOAuthConnect() {
    if (isPending) return;

    setIsPending(true);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const route =
        providerKind === "phrase"
          ? apiClient.api.orgs[":organizationSlug"]["external-tms-provider-credential"].phrase.user
              .oauth.start
          : providerKind === "lokalise"
            ? apiClient.api.orgs[":organizationSlug"]["external-tms-provider-credential"].lokalise
                .user.oauth.start
            : apiClient.api.orgs[":organizationSlug"]["external-tms-provider-credential"].crowdin
                .user.oauth.start;
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

  function handleClick() {
    if (providerKind === "crowdin" && connectMethod === "pat") {
      setPatDialogOpen(true);
      return;
    }

    void handleOAuthConnect();
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("hidden sm:inline-flex", className)}
        disabled={isPending}
        onClick={handleClick}
      >
        <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-4" />
        {isPending ? "Connecting..." : `Connect ${label}`}
      </Button>

      {providerKind === "crowdin" && connectMethod === "pat" ? (
        <CrowdinUserPatConnectDialog
          organizationSlug={organizationSlug}
          providerDisplayName={label}
          open={patDialogOpen}
          onOpenChange={setPatDialogOpen}
        />
      ) : null}
    </>
  );
}
