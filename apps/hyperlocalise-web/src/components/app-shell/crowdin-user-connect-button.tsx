"use client";

import { useState } from "react";
import { Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

export function CrowdinUserConnectButton({
  organizationSlug,
  className,
}: {
  organizationSlug: string;
  className?: string;
}) {
  const [isPending, setIsPending] = useState(false);

  async function handleConnect() {
    if (isPending) return;

    setIsPending(true);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const response = await apiClient.api.orgs[":organizationSlug"][
        "external-tms-provider-credential"
      ].crowdin.user.oauth.start.$post({
        param: { organizationSlug },
        json: { returnTo },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(body?.message ?? body?.error ?? "Failed to start Crowdin connection");
      }

      const body = (await response.json()) as { authorizationUrl: string };
      window.location.assign(body.authorizationUrl);
    } catch (error) {
      setIsPending(false);
      toast.error(error instanceof Error ? error.message : "Failed to start Crowdin connection");
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
      {isPending ? "Connecting..." : "Connect Crowdin"}
    </Button>
  );
}
