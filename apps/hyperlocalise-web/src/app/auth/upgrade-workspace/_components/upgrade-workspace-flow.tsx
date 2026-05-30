"use client";

import { useActionState, useEffect, useRef } from "react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { LocalOrgWorkspaceSummary } from "@/lib/organizations/migrate-local-org-to-workos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

import { upgradeWorkspacesAction, type UpgradeWorkspacesActionState } from "../actions";

type UpgradeWorkspaceFlowProps = {
  workspaces: LocalOrgWorkspaceSummary[];
};

const initialState: UpgradeWorkspacesActionState = {};

export function UpgradeWorkspaceFlow({ workspaces }: UpgradeWorkspaceFlowProps) {
  const [state, formAction, isPending] = useActionState(upgradeWorkspacesAction, initialState);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    formAction();
  }, [formAction]);

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
            <Progress value={isPending ? 45 : state.error ? 100 : 85} className="h-2">
              <ProgressLabel className="sr-only">Workspace upgrade progress</ProgressLabel>
            </Progress>
            <TypographyP className="text-sm text-muted-foreground">
              {isPending
                ? "Creating your WorkOS organization and memberships…"
                : state.error
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

          {state.error ? (
            <div className="flex flex-col gap-3">
              <Alert variant="destructive">
                <AlertTitle>Could not finish the upgrade</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => {
                  startedRef.current = true;
                  formAction();
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
