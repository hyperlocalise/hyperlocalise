"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createApiClient } from "@/lib/api-client";

const api = createApiClient();

type SettingsPageContentProps = {
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
      toast.success("GitHub integration disconnected");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function SettingsPageContent({ organizationSlug }: SettingsPageContentProps) {
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-medium text-white">Settings</h1>
        <p className="mt-1 text-sm text-white/52">
          Manage organization integrations and preferences.
        </p>
      </div>

      <Card className="rounded-2xl border border-white/8 bg-[#080808] py-0 text-white ring-0">
        <CardHeader className="gap-2 px-5 py-5 lg:px-6">
          <CardTitle className="text-lg font-medium text-white">GitHub integration</CardTitle>
          <CardDescription className="text-white/52">
            Connect your GitHub organization so Hyperlocalise can open fix PRs and review
            translations directly from pull request comments.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-white/8" />
        <CardContent className="px-5 py-5 lg:px-6">
          {isLoading ? (
            <div className="h-10 animate-pulse rounded-lg bg-white/5" />
          ) : installation ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Connected</p>
                  <p className="mt-1 text-sm text-white/52">
                    {installation.accountLogin
                      ? `Installed on ${installation.accountType === "Organization" ? "organization" : "account"} "${installation.accountLogin}"`
                      : `Installation ID: ${installation.githubInstallationId}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                >
                  {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>

              {/* TODO: list linked repositories and allow selecting which repos/projects to sync */}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-white/52">
                No GitHub App installation linked to this organization yet.
              </p>
              <div>
                <Button className="bg-white text-black hover:bg-white/90" onClick={handleConnect}>
                  Connect GitHub
                </Button>
              </div>

              {/* TODO: show an inline repository picker after connect so users can choose which repos to link to translation projects */}
            </div>
          )}
        </CardContent>
      </Card>

      {/* TODO: add LLM provider credential settings card (currently only available via API) */}
      {/* TODO: add team management settings card (currently only available via API) */}
    </div>
  );
}
