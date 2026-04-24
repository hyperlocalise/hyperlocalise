"use client";

import { useCallback } from "react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiClient } from "@/lib/api-client";

const api = createApiClient();

type GitHubAgentCardProps = {
  organizationSlug: string;
};

function useGitHubInstallation(organizationSlug: string) {
  return useQuery({
    queryKey: ["github-installation", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch GitHub installation");
      }
      const data = await res.json();
      return data.installation;
    },
  });
}

function useInstallUrl(organizationSlug: string) {
  return useQuery({
    queryKey: ["github-install-url", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"][
        "install-url"
      ].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error("Failed to get install URL");
      }
      const data = await res.json();
      return data.url;
    },
    enabled: false,
  });
}

function useDisconnectInstallation(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"].$delete({
        param: { organizationSlug },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "unknown_error" }));
        throw new Error("error" in error ? String(error.error) : "Disconnect failed");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["github-installation", organizationSlug] });
      toast.success("GitHub agent disconnected");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function GitHubAgentCard({ organizationSlug }: GitHubAgentCardProps) {
  const { data: installation, isLoading } = useGitHubInstallation(organizationSlug);
  const { refetch: getInstallUrl } = useInstallUrl(organizationSlug);
  const disconnect = useDisconnectInstallation(organizationSlug);

  const handleConnect = useCallback(async () => {
    const { data: url } = await getInstallUrl();
    if (url) {
      window.location.href = url;
    } else {
      toast.error("Failed to generate GitHub install URL");
    }
  }, [getInstallUrl]);

  return (
    <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
      <CardHeader className="gap-4 px-5 py-5 lg:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <HugeiconsIcon icon={GithubIcon} strokeWidth={1.8} className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg font-medium text-white">GitHub agent</CardTitle>
              <CardDescription className="mt-1 text-white/52">
                Let Hyperlocalise watch pull request activity, review changed copy, and open
                localization fix PRs.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 rounded-full border-dew-500/25 bg-dew-500/10 text-dew-100"
          >
            Available
          </Badge>
        </div>
      </CardHeader>
      <Separator className="bg-white/8" />
      <CardContent className="px-5 py-5 lg:px-6">
        {isLoading ? (
          <Skeleton className="h-10 bg-white/5" />
        ) : installation ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-white">Connected</p>
                <p className="mt-1 text-sm text-white/52">
                  {installation.accountLogin
                    ? `Installed on ${
                        installation.accountType === "Organization" ? "organization" : "account"
                      } "${installation.accountLogin}"`
                    : `Installation ID: ${installation.githubInstallationId}`}
                </p>
              </div>
              <Button
                variant="outline"
                className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-white/52">
              No GitHub App installation is linked to this organization yet.
            </p>
            <div>
              <Button className="bg-white text-black hover:bg-white/90" onClick={handleConnect}>
                Connect GitHub
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
