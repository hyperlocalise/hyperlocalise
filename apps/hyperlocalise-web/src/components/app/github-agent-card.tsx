"use client";

import { useCallback, useMemo, useState } from "react";
import { GitBranchIcon, GithubIcon, Refresh01Icon, Search01Icon } from "@hugeicons/core-free-icons";
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

type GitHubInstallation = {
  githubInstallationId: number;
  accountLogin: string | null;
  accountType: string | null;
  repositoryCount?: number;
  enabledRepositoryCount?: number;
};

type GitHubRepository = {
  githubRepositoryId: number;
  fullName: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string | null;
  enabled: boolean;
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
      return data.installation as GitHubInstallation | null;
    },
  });
}

function useGitHubRepositories(organizationSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["github-installation-repositories", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].$get({
        param: { organizationSlug },
        query: {},
      });
      if (!res.ok) {
        throw new Error("Failed to fetch GitHub repositories");
      }
      const data = await res.json();
      return data.repositories as GitHubRepository[];
    },
    enabled,
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

function useSyncRepositories(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].sync.$post({
        param: { organizationSlug },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "sync_failed" }));
        throw new Error("error" in error ? String(error.error) : "Sync failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github-installation", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["github-installation-repositories", organizationSlug],
        }),
      ]);
      toast.success("GitHub repositories synced");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useUpdateRepositories(organizationSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabledRepositoryIds: number[]) => {
      const res = await api.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].$patch({
        param: { organizationSlug },
        json: { enabledRepositoryIds },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "update_failed" }));
        throw new Error("error" in error ? String(error.error) : "Update failed");
      }
      const data = await res.json();
      return data.repositories as GitHubRepository[];
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github-installation", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["github-installation-repositories", organizationSlug],
        }),
      ]);
      toast.success("Enabled repositories updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["github-installation", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["github-installation-repositories", organizationSlug],
        }),
      ]);
      toast.success("GitHub agent disconnected");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function GitHubAgentCard({ organizationSlug }: GitHubAgentCardProps) {
  const { data: installation, isLoading } = useGitHubInstallation(organizationSlug);
  const { data: repositories = [], isLoading: isLoadingRepositories } = useGitHubRepositories(
    organizationSlug,
    Boolean(installation),
  );
  const { refetch: getInstallUrl } = useInstallUrl(organizationSlug);
  const syncRepositories = useSyncRepositories(organizationSlug);
  const updateRepositories = useUpdateRepositories(organizationSlug);
  const disconnect = useDisconnectInstallation(organizationSlug);
  const [query, setQuery] = useState("");
  const [selectedRepositoryIds, setSelectedRepositoryIds] = useState<Set<number> | null>(null);

  const effectiveSelection = useMemo(() => {
    if (selectedRepositoryIds) {
      return selectedRepositoryIds;
    }

    return new Set(
      repositories
        .filter((repository) => repository.enabled)
        .map((repository) => repository.githubRepositoryId),
    );
  }, [repositories, selectedRepositoryIds]);

  const filteredRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return repositories;
    }

    return repositories.filter((repository) =>
      repository.fullName.toLowerCase().includes(normalizedQuery),
    );
  }, [query, repositories]);

  const handleConnect = useCallback(async () => {
    const { data: url } = await getInstallUrl();
    if (url) {
      window.location.href = url;
    } else {
      toast.error("Failed to generate GitHub install URL");
    }
  }, [getInstallUrl]);

  const toggleRepository = useCallback(
    (repositoryId: number) => {
      const next = new Set(effectiveSelection);
      if (next.has(repositoryId)) {
        next.delete(repositoryId);
      } else {
        next.add(repositoryId);
      }
      setSelectedRepositoryIds(next);
    },
    [effectiveSelection],
  );

  const handleEnableSelected = useCallback(() => {
    updateRepositories.mutate([...effectiveSelection]);
    setSelectedRepositoryIds(null);
  }, [effectiveSelection, updateRepositories]);

  const handleEnableAll = useCallback(() => {
    const allRepositoryIds = repositories.map((repository) => repository.githubRepositoryId);
    updateRepositories.mutate(allRepositoryIds);
    setSelectedRepositoryIds(new Set(allRepositoryIds));
  }, [repositories, updateRepositories]);

  const installationSettingsUrl =
    installation?.accountType === "Organization" && installation.accountLogin
      ? `https://github.com/organizations/${installation.accountLogin}/settings/installations/${installation.githubInstallationId}`
      : installation
        ? `https://github.com/settings/installations/${installation.githubInstallationId}`
        : null;

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
          <div className="flex flex-col gap-5">
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
                <p className="mt-1 text-xs text-white/38">
                  {installation.enabledRepositoryCount ?? 0} of{" "}
                  {installation.repositoryCount ?? repositories.length} repositories enabled
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {installationSettingsUrl ? (
                  <Button
                    variant="outline"
                    className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white"
                    render={<a href={installationSettingsUrl} target="_blank" rel="noreferrer" />}
                  >
                    Manage access
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white"
                  onClick={() => syncRepositories.mutate()}
                  disabled={syncRepositories.isPending}
                >
                  <HugeiconsIcon icon={Refresh01Icon} strokeWidth={1.8} className="size-4" />
                  {syncRepositories.isPending ? "Syncing..." : "Sync"}
                </Button>
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
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 md:flex-row">
                <div className="relative min-w-0 flex-1">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/38"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search repositories"
                    className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-9 text-sm text-white outline-none placeholder:text-white/32 focus:border-white/20"
                  />
                </div>
                <Button
                  className="bg-white text-black hover:bg-white/90"
                  onClick={handleEnableSelected}
                  disabled={updateRepositories.isPending || repositories.length === 0}
                >
                  Enable {effectiveSelection.size}
                </Button>
                <Button
                  variant="outline"
                  className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white"
                  onClick={handleEnableAll}
                  disabled={updateRepositories.isPending || repositories.length === 0}
                >
                  Enable all
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border border-white/10">
                <div className="grid grid-cols-[48px_minmax(0,1fr)_140px] border-b border-white/10 bg-white/[0.03] text-xs font-medium tracking-wide text-white/42 uppercase">
                  <div className="px-4 py-3">
                    <span className="sr-only">Enabled</span>
                  </div>
                  <div className="px-4 py-3">Repositories</div>
                  <div className="px-4 py-3">Branch</div>
                </div>
                {isLoadingRepositories ? (
                  <div className="p-4">
                    <Skeleton className="h-10 bg-white/5" />
                  </div>
                ) : filteredRepositories.length > 0 ? (
                  filteredRepositories.map((repository) => {
                    const checked = effectiveSelection.has(repository.githubRepositoryId);
                    return (
                      <label
                        key={repository.githubRepositoryId}
                        className="grid min-h-14 cursor-pointer grid-cols-[48px_minmax(0,1fr)_140px] items-center border-b border-white/8 text-sm last:border-b-0 hover:bg-white/[0.03]"
                      >
                        <div className="px-4">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRepository(repository.githubRepositoryId)}
                            className="size-4 accent-white"
                            aria-label={`Enable ${repository.fullName}`}
                          />
                        </div>
                        <div className="min-w-0 px-4">
                          <div className="flex min-w-0 items-center gap-2">
                            <HugeiconsIcon
                              icon={GithubIcon}
                              strokeWidth={1.8}
                              className="size-4 shrink-0 text-white/60"
                            />
                            <span className="truncate text-white/82">{repository.fullName}</span>
                            {repository.private ? (
                              <Badge
                                variant="outline"
                                className="border-white/10 bg-white/5 text-white/52"
                              >
                                Private
                              </Badge>
                            ) : null}
                            {repository.archived ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/20 bg-amber-500/10 text-amber-100"
                              >
                                Archived
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-2 px-4 text-white/52">
                          <HugeiconsIcon
                            icon={GitBranchIcon}
                            strokeWidth={1.8}
                            className="size-4 shrink-0"
                          />
                          <span className="truncate">{repository.defaultBranch ?? "default"}</span>
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <div className="px-4 py-8 text-sm text-white/52">
                    {repositories.length === 0
                      ? "No repositories are available to this GitHub App installation."
                      : "No repositories match this search."}
                  </div>
                )}
              </div>
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
