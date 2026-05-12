"use client";

import { useCallback } from "react";
import { LinkSquare02Icon, SlackIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { createApiClient } from "@/lib/api-client";
import { TypographyP } from "@/components/ui/typography";

const api = createApiClient();

type SlackAgentCardProps = {
  organizationSlug: string;
};

export type SlackAgentState = {
  enabled: boolean;
  teamId: string | null;
  teamName: string | null;
};

export function getSlackAgentViewModel(slackAgent: SlackAgentState | undefined) {
  const connected = Boolean(slackAgent?.teamId);
  const enabled = connected && Boolean(slackAgent?.enabled);

  return {
    connected,
    enabled,
    badgeLabel: connected ? "Connected" : "Available",
    statusTitle: connected ? (enabled ? "Enabled" : "Disabled") : "Not connected",
    statusDescription: connected
      ? `Installed on ${slackAgent?.teamName ?? slackAgent?.teamId ?? "Slack workspace"}`
      : "Connect a Slack workspace to let Hyperlocalise respond to mentions, DMs, and subscribed threads.",
    primaryActionLabel: connected ? "Reconnect Slack" : "Connect Slack",
    toggleDisabled: !connected,
  };
}

function useSlackAgentState(organizationSlug: string) {
  return useQuery({
    queryKey: ["slack-agent", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["agent-slack"].$get({
        param: { organizationSlug },
      });

      if (!res.ok) {
        throw new Error("Failed to load Slack agent settings");
      }

      const data = await res.json();
      return data.slackAgent as SlackAgentState;
    },
  });
}

function useSlackInstallUrl(organizationSlug: string) {
  return useQuery({
    queryKey: ["slack-install-url", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["agent-slack"]["install-url"].$get({
        param: { organizationSlug },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "install_url_failed" }));
        throw new Error("error" in error ? String(error.error) : "Failed to get Slack install URL");
      }

      const data = await res.json();
      return data.url;
    },
    enabled: false,
  });
}

function useUpdateSlackAgentState(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await api.api.orgs[":organizationSlug"]["agent-slack"].$patch({
        param: { organizationSlug },
        json: { enabled },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "update_failed" }));
        throw new Error("error" in error ? String(error.error) : "Failed to update Slack agent");
      }

      const data = await res.json();
      return data.slackAgent as SlackAgentState;
    },
    onSuccess: async (_data, enabled) => {
      await queryClient.invalidateQueries({ queryKey: ["slack-agent", organizationSlug] });
      toast.success(enabled ? "Slack agent enabled" : "Slack agent disabled");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function SlackAgentCard({ organizationSlug }: SlackAgentCardProps) {
  const { data: slackAgent, isLoading, isError, error } = useSlackAgentState(organizationSlug);
  const { refetch: getInstallUrl, isFetching: isCreatingInstallUrl } =
    useSlackInstallUrl(organizationSlug);
  const updateSlackAgentState = useUpdateSlackAgentState(organizationSlug);
  const viewModel = getSlackAgentViewModel(slackAgent);

  const handleConnect = useCallback(async () => {
    try {
      const { data: url } = await getInstallUrl();
      if (url) {
        window.location.href = url;
        return;
      }

      toast.error("Failed to generate Slack install URL");
    } catch (installError) {
      toast.error(installError instanceof Error ? installError.message : "Unable to connect Slack");
    }
  }, [getInstallUrl]);

  return (
    <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
      <CardHeader className="gap-4 px-5 py-5 lg:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
              <HugeiconsIcon icon={SlackIcon} strokeWidth={1.8} className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg font-medium text-foreground">Slack agent</CardTitle>
              <CardDescription className="mt-1 text-foreground/52">
                Triage release requests, answer localization questions, and notify Slack channels.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              viewModel.connected
                ? "shrink-0 rounded-full border-dew-500/25 bg-dew-500/10 text-dew-100"
                : "shrink-0 rounded-full border-foreground/10 bg-foreground/4 text-foreground/52"
            }
          >
            {viewModel.badgeLabel}
          </Badge>
        </div>
      </CardHeader>
      <Separator className="bg-foreground/8" />
      <CardContent className="px-5 py-5 lg:px-6">
        {isLoading ? (
          <Skeleton className="h-10 bg-foreground/5" />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <TypographyP className="text-sm font-medium text-foreground">
                  {isError ? "Settings unavailable" : viewModel.statusTitle}
                </TypographyP>
                <TypographyP className="mt-1 text-sm text-foreground/52">
                  {isError ? error.message : viewModel.statusDescription}
                </TypographyP>
                {slackAgent?.teamId ? (
                  <TypographyP className="mt-1 text-xs text-foreground/38">
                    Workspace ID: {slackAgent.teamId}
                  </TypographyP>
                ) : null}
              </div>
              <Switch
                checked={viewModel.enabled}
                onCheckedChange={(enabled) => updateSlackAgentState.mutate(enabled)}
                aria-label="Enable Slack agent"
                className="data-checked:bg-dew-500"
                disabled={
                  viewModel.toggleDisabled ||
                  isError ||
                  updateSlackAgentState.isPending ||
                  isCreatingInstallUrl
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-foreground text-background hover:bg-foreground/90"
                onClick={handleConnect}
                disabled={isCreatingInstallUrl}
              >
                <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.8} className="size-4" />
                {isCreatingInstallUrl ? "Opening Slack..." : viewModel.primaryActionLabel}
              </Button>
              {viewModel.connected ? (
                <Button
                  variant="outline"
                  className="border-foreground/10 bg-transparent text-foreground hover:bg-foreground/8 hover:text-foreground"
                  onClick={() => updateSlackAgentState.mutate(false)}
                  disabled={!viewModel.enabled || updateSlackAgentState.isPending}
                >
                  {updateSlackAgentState.isPending ? "Updating..." : "Disable"}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
