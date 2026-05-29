"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SlackIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getSlackAgentViewModel } from "./slack-agent-view-model";
import { IntegrationRow } from "./integration-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { createApiClient } from "@/lib/api-client";
import { TypographyP } from "@/components/ui/typography";

const api = createApiClient();

type SlackIntegrationRowProps = {
  organizationSlug: string;
  isLast?: boolean;
  userCanManage: boolean;
};

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
      return data.slackAgent;
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
      return data.slackAgent;
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

export function SlackIntegrationRow({
  organizationSlug,
  isLast = false,
  userCanManage,
}: SlackIntegrationRowProps) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const handledSlackConnectedRef = useRef(false);

  const { data: slackAgent, isLoading, isError } = useSlackAgentState(organizationSlug);
  const { refetch: getInstallUrl, isFetching: isCreatingInstallUrl } =
    useSlackInstallUrl(organizationSlug);
  const updateSlackAgentState = useUpdateSlackAgentState(organizationSlug);
  const viewModel = getSlackAgentViewModel(slackAgent);

  useEffect(() => {
    if (searchParams.get("slack_connected") !== "1" || handledSlackConnectedRef.current) {
      return;
    }

    handledSlackConnectedRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("slack_connected");
    window.history.replaceState(null, "", url.toString());

    void queryClient.invalidateQueries({ queryKey: ["slack-agent", organizationSlug] }).then(() => {
      setExpanded(true);
      toast.success("Slack connected");
    });
  }, [organizationSlug, queryClient, searchParams]);

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

  const action = !userCanManage ? "view-only" : viewModel.connected ? "manage" : "connect";

  return (
    <IntegrationRow
      name="Slack"
      description={
        isError
          ? "Unable to load Slack settings right now."
          : viewModel.connected
            ? viewModel.statusDescription
            : "Work with Cloud Agents from Slack — mentions, DMs, and subscribed threads."
      }
      icon={<HugeiconsIcon icon={SlackIcon} strokeWidth={1.8} className="size-5" />}
      action={action}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onConnect={() => void handleConnect()}
      isConnecting={isCreatingInstallUrl}
      isLast={isLast}
    >
      {isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <TypographyP className="text-sm font-medium text-foreground">
                {isError ? "Settings unavailable" : viewModel.statusTitle}
              </TypographyP>
              {slackAgent?.teamId ? (
                <TypographyP className="mt-1 text-xs text-muted-foreground">
                  Workspace ID: {slackAgent.teamId}
                </TypographyP>
              ) : null}
            </div>
            <Switch
              checked={viewModel.enabled}
              onCheckedChange={(enabled) => updateSlackAgentState.mutate(enabled)}
              aria-label="Enable Slack agent"
              disabled={
                viewModel.toggleDisabled ||
                isError ||
                updateSlackAgentState.isPending ||
                isCreatingInstallUrl ||
                !userCanManage
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void handleConnect()} disabled={isCreatingInstallUrl}>
              {isCreatingInstallUrl ? "Opening Slack..." : viewModel.primaryActionLabel}
            </Button>
            {viewModel.connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateSlackAgentState.mutate(false)}
                disabled={!viewModel.enabled || updateSlackAgentState.isPending}
              >
                {updateSlackAgentState.isPending ? "Updating..." : "Disable"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </IntegrationRow>
  );
}
