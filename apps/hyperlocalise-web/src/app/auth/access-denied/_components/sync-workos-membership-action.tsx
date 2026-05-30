"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

function readUpgradeErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "message" in body) {
    const message = body.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function readUpgradeRedirectTo(body: unknown) {
  if (
    body &&
    typeof body === "object" &&
    "workspaceUpgrade" in body &&
    body.workspaceUpgrade &&
    typeof body.workspaceUpgrade === "object" &&
    "redirectTo" in body.workspaceUpgrade &&
    typeof body.workspaceUpgrade.redirectTo === "string"
  ) {
    return body.workspaceUpgrade.redirectTo;
  }

  return null;
}

/**
 * Temporary self-service recovery for users whose local workspace exists but WorkOS
 * membership is out of sync. Remove once automatic migration/reconcile covers all cases.
 */
export function SyncWorkosMembershipAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const syncMembership = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.auth["upgrade-workspace"].$post();
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        router.replace(
          `/auth/sign-in?returnTo=${encodeURIComponent("/auth/access-denied?reason=organization-access-denied")}`,
        );
        return null;
      }

      if (!response.ok) {
        throw new Error(
          readUpgradeErrorMessage(
            body,
            "We could not sync your workspace membership with WorkOS. Try again in a moment or contact support if this continues.",
          ),
        );
      }

      const redirectTo = readUpgradeRedirectTo(body);
      if (!redirectTo) {
        throw new Error("Sync finished without a redirect destination.");
      }

      return redirectTo;
    },
    onSuccess: (redirectTo) => {
      if (!redirectTo) {
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "We could not sync your workspace membership with WorkOS. Try again in a moment or contact support if this continues.",
      );
    },
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-4">
      <TypographyP className="text-sm leading-6 text-muted-foreground">
        If you already have a workspace here, you can retry syncing your membership with WorkOS.
      </TypographyP>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Sync failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="button"
        disabled={syncMembership.isPending}
        onClick={() => {
          setError(null);
          syncMembership.mutate();
        }}
      >
        {syncMembership.isPending ? (
          <>
            <Spinner className="size-4" />
            Syncing with WorkOS…
          </>
        ) : (
          "Sync workspace with WorkOS"
        )}
      </Button>
    </div>
  );
}
