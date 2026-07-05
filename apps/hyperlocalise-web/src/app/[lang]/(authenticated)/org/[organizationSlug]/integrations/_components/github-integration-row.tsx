"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GitBranchIcon, Refresh01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { siGithub } from "simple-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import {
  getGithubConnectErrorMessage,
  githubIntegrationRowMessages,
} from "./github-integration-row.messages";
import { IntegrationRow } from "./integration-row";
import { RepositoryAutomationSettingsAction } from "./repository-automation-settings-action";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiClient } from "@/lib/api-client";
import { cn } from "@/lib/primitives/cn";
import { TypographyP } from "@/components/ui/typography";

const api = createApiClient();

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

function useSyncRepositories(organizationSlug: string, intl: IntlShape) {
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
      toast.success(intl.formatMessage(githubIntegrationRowMessages.repositoryListRefreshedToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useUpdateRepositories(organizationSlug: string, intl: IntlShape) {
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
      toast.success(
        intl.formatMessage(githubIntegrationRowMessages.enabledRepositoriesUpdatedToast),
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useDisconnectInstallation(organizationSlug: string, intl: IntlShape) {
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
      toast.success(intl.formatMessage(githubIntegrationRowMessages.disconnectedToast));
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
  const intl = useIntl();
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

    toast.error(getGithubConnectErrorMessage(intl, errorCode));
  }, [intl, searchParams]);

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
      toast.success(intl.formatMessage(githubIntegrationRowMessages.connectedToast));
    })();
  }, [intl, organizationSlug, queryClient, refetchInstallation, searchParams]);

  const { data: repositories = [], isLoading: isLoadingRepositories } = useGitHubRepositories(
    organizationSlug,
    Boolean(installation),
  );
  const { refetch: getInstallUrl, isFetching: isCreatingInstallUrl } =
    useInstallUrl(organizationSlug);
  const syncRepositories = useSyncRepositories(organizationSlug, intl);
  const updateRepositories = useUpdateRepositories(organizationSlug, intl);
  const disconnect = useDisconnectInstallation(organizationSlug, intl);
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
  const selectionChanged = useMemo(
    () =>
      repositories.some(
        (repository) =>
          effectiveSelection.has(repository.githubRepositoryId) !== repository.enabled,
      ),
    [effectiveSelection, repositories],
  );

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
      toast.error(intl.formatMessage(githubIntegrationRowMessages.installUrlFailedToast));
    }
  }, [getInstallUrl, intl]);

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

  const description = useMemo(() => {
    if (!installation) {
      return intl.formatMessage(githubIntegrationRowMessages.disconnectedDescription);
    }

    const repoSummary = intl.formatMessage(githubIntegrationRowMessages.repoSummary, {
      enabledCount: installation.enabledRepositoryCount ?? 0,
      totalCount: installation.repositoryCount ?? repositories.length,
    });

    return installation.accountLogin
      ? intl.formatMessage(githubIntegrationRowMessages.connectedAsDescription, {
          accountLogin: installation.accountLogin,
          repoSummary,
        })
      : intl.formatMessage(githubIntegrationRowMessages.connectedDescription, { repoSummary });
  }, [installation, intl, repositories.length]);

  const action = !userCanManage
    ? connected
      ? "view-only"
      : "view-only"
    : connected
      ? "manage"
      : "connect";

  return (
    <IntegrationRow
      name={intl.formatMessage(githubIntegrationRowMessages.name)}
      description={description}
      icon={<SimpleBrandIcon icon={siGithub} colored={hasEnabledRepositories} />}
      iconMuted={!hasEnabledRepositories}
      action={action}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onConnect={() => void handleConnect()}
      isConnecting={isCreatingInstallUrl}
      isLoading={isLoading}
      isLast={isLast}
    >
      {isLoading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : isError ? (
        <div className="flex flex-col gap-3">
          <TypographyP className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : intl.formatMessage(githubIntegrationRowMessages.loadError)}
          </TypographyP>
          <Button variant="outline" size="sm" onClick={() => void refetchInstallation()}>
            <FormattedMessage {...githubIntegrationRowMessages.retry} />
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
                <FormattedMessage {...githubIntegrationRowMessages.manageAccessOnGitHub} />
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncRepositories.mutate()}
              disabled={syncRepositories.isPending}
              title={intl.formatMessage(githubIntegrationRowMessages.refreshRepoListTitle)}
            >
              <HugeiconsIcon icon={Refresh01Icon} strokeWidth={1.8} className="size-4" />
              {syncRepositories.isPending ? (
                <FormattedMessage {...githubIntegrationRowMessages.refreshingRepoList} />
              ) : (
                <FormattedMessage {...githubIntegrationRowMessages.refreshRepoList} />
              )}
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
              {disconnect.isPending ? (
                <FormattedMessage {...githubIntegrationRowMessages.disconnecting} />
              ) : (
                <FormattedMessage {...githubIntegrationRowMessages.disconnect} />
              )}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative min-w-0 flex-1">
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={intl.formatMessage(
                    githubIntegrationRowMessages.searchRepositoriesPlaceholder,
                  )}
                  aria-label={intl.formatMessage(
                    githubIntegrationRowMessages.searchRepositoriesAriaLabel,
                  )}
                  className="h-9 w-full rounded-lg border border-border bg-background px-9 text-sm text-foreground transition-all outline-none placeholder:text-muted-foreground focus:border-input focus:ring-[3px] focus:ring-border"
                />
              </div>
              {selectionChanged ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnableSelected}
                  disabled={updateRepositories.isPending || repositories.length === 0}
                >
                  <FormattedMessage
                    {...githubIntegrationRowMessages.enableSelected}
                    values={{ count: effectiveSelection.size }}
                  />
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnableAll}
                disabled={
                  updateRepositories.isPending ||
                  repositories.length === 0 ||
                  effectiveSelection.size === repositories.length
                }
              >
                <FormattedMessage {...githubIntegrationRowMessages.enableAll} />
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="grid grid-cols-[48px_minmax(0,1fr)_120px_260px] border-b border-border bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <div className="px-4 py-3">
                  <span className="sr-only">
                    <FormattedMessage {...githubIntegrationRowMessages.enabledColumnSrOnly} />
                  </span>
                </div>
                <div className="px-4 py-3">
                  <FormattedMessage {...githubIntegrationRowMessages.repositoriesColumn} />
                </div>
                <div className="px-4 py-3">
                  <FormattedMessage {...githubIntegrationRowMessages.branchColumn} />
                </div>
                <div className="px-4 py-3 text-right">
                  <FormattedMessage {...githubIntegrationRowMessages.actionColumn} />
                </div>
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
                        "grid min-h-12 cursor-pointer grid-cols-[48px_minmax(0,1fr)_120px_260px] items-center border-b border-border text-sm transition-colors last:border-b-0 hover:bg-accent/50",
                        checked && "bg-muted/30",
                      )}
                    >
                      <div className="px-4">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRepository(repository.githubRepositoryId)}
                          className="size-4 rounded border-input accent-foreground"
                          aria-label={intl.formatMessage(
                            githubIntegrationRowMessages.enableRepositoryAriaLabel,
                            { repositoryFullName: repository.fullName },
                          )}
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
                              <FormattedMessage {...githubIntegrationRowMessages.privateBadge} />
                            </Badge>
                          ) : null}
                          {repository.archived ? (
                            <Badge
                              variant="outline"
                              className="border-border bg-accent text-accent-foreground"
                            >
                              <FormattedMessage {...githubIntegrationRowMessages.archivedBadge} />
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-2 px-4 text-muted-foreground">
                        <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />
                        <span className="truncate">
                          {repository.defaultBranch ??
                            intl.formatMessage(githubIntegrationRowMessages.defaultBranchFallback)}
                        </span>
                      </div>
                      <div
                        className="px-4"
                        onClick={(event) => event.preventDefault()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <RepositoryAutomationSettingsAction
                            organizationSlug={organizationSlug}
                            githubRepositoryId={repository.githubRepositoryId}
                            repositoryFullName={repository.fullName}
                            enabled={checked}
                            archived={repository.archived}
                            userCanManage={userCanManage}
                          />
                        </div>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {repositories.length === 0 ? (
                    <FormattedMessage {...githubIntegrationRowMessages.noRepositoriesAvailable} />
                  ) : (
                    <FormattedMessage {...githubIntegrationRowMessages.noRepositoriesMatchSearch} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </IntegrationRow>
  );
}
