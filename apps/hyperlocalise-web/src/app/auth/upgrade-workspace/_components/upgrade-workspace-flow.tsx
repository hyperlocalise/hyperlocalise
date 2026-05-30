"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";

import type { LocalOrgWorkspaceSummary } from "@/lib/organizations/migrate-local-org-to-workos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

type UpgradeWorkspaceFlowProps = {
  workspaces: LocalOrgWorkspaceSummary[];
};

function readUpgradeErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "message" in body) {
    const message = body.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

export function UpgradeWorkspaceFlow({ workspaces }: UpgradeWorkspaceFlowProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const upgradeWorkspaces = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.auth["upgrade-workspace"].$post();
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        router.replace("/auth/sign-in?returnTo=/auth/upgrade-workspace");
        return null;
      }

      if (!response.ok) {
        throw new Error(
          readUpgradeErrorMessage(
            body,
            "We could not connect your workspace to secure sign-in. Try again in a moment or contact support if this continues.",
          ),
        );
      }

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

      throw new Error("Upgrade finished without a redirect destination.");
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
          : "We could not connect your workspace to secure sign-in. Try again in a moment or contact support if this continues.",
      );
    },
  });

  const runUpgrade = upgradeWorkspaces.mutate;

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    setError(null);
    runUpgrade();
  }, [runUpgrade]);

  const isPending = upgradeWorkspaces.isPending;

  const workspaceLabel =
    workspaces.length === 1
      ? (workspaces[0]?.name ?? "your workspace")
      : `${workspaces.length} workspaces`;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-lg border-border/70 bg-background shadow-2xl shadow-foreground/12">
        <CardHeader className="gap-4">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon icon={SparklesIcon} className="size-5" strokeWidth={1.75} />
          </div>
          <div className="space-y-2">
            <TypographyH1 className="font-heading text-2xl tracking-tight">
              Connecting your workspace
            </TypographyH1>
            <CardDescription className="text-base text-muted-foreground">
              We are performing a one-time update for {workspaceLabel} so membership and access stay
              in sync with secure sign-in. This usually takes a few seconds.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-2">
            <Progress value={isPending ? 45 : error ? 100 : 85} className="h-2">
              <ProgressLabel className="sr-only">Workspace upgrade progress</ProgressLabel>
            </Progress>
            <TypographyP className="text-sm text-muted-foreground">
              {isPending
                ? "Creating your WorkOS organization and memberships…"
                : error
                  ? "Upgrade could not be completed."
                  : "Finishing setup…"}
            </TypographyP>
          </div>

          {isPending ? (
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 px-4 py-3">
              <Spinner className="size-4 text-primary" />
              <TypographyP className="text-sm text-muted-foreground">
                Please keep this tab open while we upgrade your workspace.
              </TypographyP>
            </div>
          ) : null}

          {error ? (
            <div className="flex flex-col gap-3">
              <Alert variant="destructive">
                <AlertTitle>Could not finish the upgrade</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  upgradeWorkspaces.mutate();
                }}
              >
                Try again
              </Button>
            </div>
          ) : null}

          {workspaces.length > 1 ? (
            <ul className="space-y-2 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {workspaces.map((workspace) => (
                <li key={workspace.organizationId}>{workspace.name}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
