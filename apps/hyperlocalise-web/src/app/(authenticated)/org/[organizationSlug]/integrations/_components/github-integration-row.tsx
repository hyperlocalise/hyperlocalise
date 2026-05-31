"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GitBranchIcon, Refresh01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { siGithub } from "simple-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { IntegrationRow } from "./integration-row";
import { RepositoryI18nSetupAction } from "./repository-i18n-setup-action";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiClient } from "@/lib/api-client";
import { cn } from "@/lib/primitives/cn";
import { TypographyP } from "@/components/ui/typography";

const api = createApiClient();

const GITHUB_CONNECT_ERROR_MESSAGES: Record<string, string> = {
  missing_callback_params:
    "GitHub did not return installation_id on the Setup URL callback. Confirm the GitHub App Setup URL points to this app and try connecting again.",
  invalid_state:
    "The GitHub install link expired or was already used. Click Connect again from this page.",
  github_install_pending_approval:
    "GitHub is waiting for an org owner to approve this app install. Approve it on GitHub, then connect again.",
  github_app_not_configured: "GitHub App integration is not configured for this environment.",
  github_app_private_key_invalid:
    "GitHub rejected the app credentials in this environment. Set GITHUB_APP_ID to the App ID from GitHub App settings and GITHUB_APP_PRIVATE_KEY to the matching PEM (use literal \\n line breaks or base64-encode the whole file).",
  github_installation_invalid:
    "GitHub rejected the installation ID. Confirm the app is installed on the expected account.",
  github_installation_already_linked:
    "That GitHub installation is already linked to another Hyperlocalise organization.",
  organization_not_found: "The organization for this install request could not be found.",
  github_use_setup_url:
    'GitHub returned a user OAuth code instead of an installation ID. In GitHub App settings, turn off "Request user authorization (OAuth) during installation" and set the Setup URL to this app\'s /auth/github/callback.',
};

type GitHubIntegrationRowProps = {
  organizationSlug: string;
  isLast?: boolean;
  userCanManage: boolean;
};

type GitHubInstallation = {
  githubInstallationId: string;
  accountLogin: string | null;
  accountType: string | null;
  repositoryCount?: number;
  enabledRepositoryCount?: number;
};

type GitHubRepository = {
  githubRepositoryId: string;
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
    mutationFn: async (enabledRepositoryIds: string[]) => {
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
      toast.success("GitHub disconnected");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function GitHubIntegrationRow({
  organizationSlug,
  isLast = false,
  userCanManage,
}: GitHubIntegrationRowProps) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const {
    data: installation,
    isLoading,
    isError,
    error,
    refetch: refetchInstallation,
  } = useGitHubInstallation(organizationSlug);

  const handledGithubConnectedRef = useRef(false);
  const handledGithubErrorRef = useRef(false);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode || handledGithubErrorRef.current) {
      return;
    }

    handledGithubErrorRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url.toString());

    const message =
      GITHUB_CONNECT_ERROR_MESSAGES[errorCode] ??
      "GitHub App connection failed. Try connecting again.";
    toast.error(message);
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("github_connected") !== "1" || handledGithubConnectedRef.current) {
      return;
    }

    handledGithubConnectedRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("github_connected");
    window.history.replaceState(null, "", url.toString());

    void (async () => {
      await refetchInstallation();
      await queryClient.invalidateQueries({
        queryKey: ["github-installation-repositories", organizationSlug],
      });
      setExpanded(true);
      toast.success("GitHub connected");
    })();
  }, [organizationSlug, queryClient, refetchInstallation, searchParams]);

  const { data: repositories = [], isLoading: isLoadingRepositories } = useGitHubRepositories(
    organizationSlug,
    Boolean(installation),
  );
  const { refetch: getInstallUrl, isFetching: isCreatingInstallUrl } =
    useInstallUrl(organizationSlug);
  const syncRepositories = useSyncRepositories(organizationSlug);
  const updateRepositories = useUpdateRepositories(organizationSlug);
  const disconnect = useDisconnectInstallation(organizationSlug);
  const [query, setQuery] = useState("");
  const [selectedRepositoryIds, setSelectedRepositoryIds] = useState<Set<string> | null>(null);

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
    (repositoryId: string) => {
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
    updateRepositories.mutate([...effectiveSelection], {
      onSuccess: () => setSelectedRepositoryIds(null),
    });
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

  const connected = Boolean(installation);
  const hasEnabledRepositories =
    (installation?.enabledRepositoryCount ??
      repositories.filter((repository) => repository.enabled).length) > 0;
  const description = (() => {
    if (!installation) {
      return "Connect GitHub for pull request reviews, localization fixes, and repository context.";
    }

    const repoSummary = `${installation.enabledRepositoryCount ?? 0} of ${installation.repositoryCount ?? repositories.length} repositories enabled.`;

    return installation.accountLogin
      ? `Connected as ${installation.accountLogin}. ${repoSummary}`
      : `Connected. ${repoSummary}`;
  })();

  const action = !userCanManage
    ? connected
      ? "view-only"
      : "view-only"
    : connected
      ? "manage"
      : "connect";

  return (
    <IntegrationRow
      name="GitHub"
      description={description}
      icon={<SimpleBrandIcon icon={siGithub} colored={hasEnabledRepositories} />}
      iconMuted={!hasEnabledRepositories}
      action={action}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onConnect={() => void handleConnect()}
      isConnecting={isCreatingInstallUrl}
      isLast={isLast}
    >
      {isLoading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : isError ? (
        <div className="flex flex-col gap-3">
          <TypographyP className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Unable to load GitHub installation status right now."}
          </TypographyP>
          <Button variant="outline" size="sm" onClick={() => void refetchInstallation()}>
            Retry
          </Button>
        </div>
      ) : connected ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {installationSettingsUrl ? (
              <Button
                variant="outline"
                size="sm"
                render={
                  <a href={installationSettingsUrl} target="_blank" rel="noopener noreferrer" />
                }
              >
                Manage access on GitHub
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncRepositories.mutate()}
              disabled={syncRepositories.isPending}
            >
              <HugeiconsIcon icon={Refresh01Icon} strokeWidth={1.8} className="size-4" />
              {syncRepositories.isPending ? "Syncing..." : "Sync repositories"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => setExpanded(false),
                })
              }
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative min-w-0 flex-1">
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary/70"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search repositories"
                  aria-label="Search repositories"
                  className="h-9 w-full rounded-lg border border-border bg-background px-9 text-sm text-foreground transition-all outline-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-[3px] focus:ring-primary/20"
                />
              </div>
              <Button
                size="sm"
                onClick={handleEnableSelected}
                disabled={updateRepositories.isPending || repositories.length === 0}
                className="bg-primary text-primary-foreground hover:bg-primary/80"
              >
                Enable {effectiveSelection.size}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnableAll}
                disabled={updateRepositories.isPending || repositories.length === 0}
              >
                Enable all
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="grid grid-cols-[48px_minmax(0,1fr)_140px_180px] border-b border-border bg-secondary/60 text-xs font-medium tracking-wide text-secondary-foreground uppercase">
                <div className="px-4 py-3">
                  <span className="sr-only">Enabled</span>
                </div>
                <div className="px-4 py-3">Repositories</div>
                <div className="px-4 py-3">Branch</div>
                <div className="px-4 py-3 text-right">i18n setup</div>
              </div>
              {isLoadingRepositories ? (
                <div className="p-4">
                  <Skeleton className="h-10 rounded-lg" />
                </div>
              ) : filteredRepositories.length > 0 ? (
                filteredRepositories.map((repository) => {
                  const checked = effectiveSelection.has(repository.githubRepositoryId);
                  return (
                    <label
                      key={repository.githubRepositoryId}
                      className={cn(
                        "grid min-h-12 cursor-pointer grid-cols-[48px_minmax(0,1fr)_140px_180px] items-center border-b border-border text-sm transition-colors last:border-b-0 hover:bg-accent/50",
                        checked && "bg-primary/5",
                      )}
                    >
                      <div className="px-4">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRepository(repository.githubRepositoryId)}
                          className="size-4 accent-primary"
                          aria-label={`Enable ${repository.fullName}`}
                        />
                      </div>
                      <div className="min-w-0 px-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <SimpleBrandIcon
                            icon={siGithub}
                            colored={checked}
                            className="size-4 shrink-0"
                          />
                          <span className="truncate">{repository.fullName}</span>
                          {repository.private ? (
                            <Badge
                              variant="outline"
                              className="border-border bg-secondary text-secondary-foreground"
                            >
                              Private
                            </Badge>
                          ) : null}
                          {repository.archived ? (
                            <Badge
                              variant="outline"
                              className="border-border bg-accent text-accent-foreground"
                            >
                              Archived
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-2 px-4 text-muted-foreground">
                        <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />
                        <span className="truncate">{repository.defaultBranch ?? "default"}</span>
                      </div>
                      <div
                        className="px-4"
                        onClick={(event) => event.preventDefault()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <RepositoryI18nSetupAction
                          organizationSlug={organizationSlug}
                          githubRepositoryId={repository.githubRepositoryId}
                          enabled={checked}
                          userCanManage={userCanManage}
                        />
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {repositories.length === 0
                    ? "No repositories are available to this GitHub App installation."
                    : "No repositories match this search."}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </IntegrationRow>
  );
}
