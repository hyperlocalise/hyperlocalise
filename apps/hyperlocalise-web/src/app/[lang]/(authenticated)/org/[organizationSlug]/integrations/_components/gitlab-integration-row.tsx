"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GitBranchIcon, Refresh01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { siGitlab } from "simple-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import {
  getGitlabConnectErrorMessage,
  gitlabIntegrationRowMessages,
} from "./gitlab-integration-row.messages";
import { IntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiClient } from "@/lib/api-client";
import { cn } from "@/lib/primitives/cn";
import { TypographyP } from "@/components/ui/typography";

const api = createApiClient();

type GitLabIntegrationRowProps = {
  organizationSlug: string;
  isLast?: boolean;
  userCanManage: boolean;
};

type GitLabConnection = {
  id: string;
  username: string;
  displayName: string | null;
  projectCount?: number;
  enabledProjectCount?: number;
};

type GitLabProject = {
  gitlabProjectId: string;
  pathWithNamespace: string;
  private: boolean;
  archived: boolean;
  defaultBranch: string | null;
  enabled: boolean;
};

function useGitLabConnection(organizationSlug: string) {
  return useQuery({
    queryKey: ["gitlab-connection", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["gitlab-connection"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch GitLab connection");
      }
      const data = await res.json();
      return data.connection as GitLabConnection | null;
    },
  });
}

function useGitLabProjects(organizationSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["gitlab-connection-projects", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["gitlab-connection"].projects.$get({
        param: { organizationSlug },
        query: {},
      });
      if (!res.ok) {
        throw new Error("Failed to fetch GitLab projects");
      }
      const data = await res.json();
      return data.projects as GitLabProject[];
    },
    enabled,
  });
}

function useInstallUrl(organizationSlug: string) {
  return useQuery({
    queryKey: ["gitlab-install-url", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["gitlab-connection"]["install-url"].$get({
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

function useSyncProjects(organizationSlug: string, intl: IntlShape) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["gitlab-connection"].projects.sync.$post({
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
        queryClient.invalidateQueries({ queryKey: ["gitlab-connection", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["gitlab-connection-projects", organizationSlug],
        }),
      ]);
      toast.success(intl.formatMessage(gitlabIntegrationRowMessages.projectListRefreshedToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useUpdateProjects(organizationSlug: string, intl: IntlShape) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabledProjectIds: string[]) => {
      const res = await api.api.orgs[":organizationSlug"]["gitlab-connection"].projects.$patch({
        param: { organizationSlug },
        json: { enabledProjectIds },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "update_failed" }));
        throw new Error("error" in error ? String(error.error) : "Update failed");
      }
      const data = await res.json();
      return data.projects as GitLabProject[];
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gitlab-connection", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["gitlab-connection-projects", organizationSlug],
        }),
      ]);
      toast.success(intl.formatMessage(gitlabIntegrationRowMessages.enabledProjectsUpdatedToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useDisconnectConnection(organizationSlug: string, intl: IntlShape) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["gitlab-connection"].$delete({
        param: { organizationSlug },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "unknown_error" }));
        throw new Error("error" in error ? String(error.error) : "Disconnect failed");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gitlab-connection", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["gitlab-connection-projects", organizationSlug],
        }),
      ]);
      toast.success(intl.formatMessage(gitlabIntegrationRowMessages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function GitLabIntegrationRow({
  organizationSlug,
  isLast = false,
  userCanManage,
}: GitLabIntegrationRowProps) {
  const intl = useIntl();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const {
    data: connection,
    isLoading,
    isError,
    error,
    refetch: refetchConnection,
  } = useGitLabConnection(organizationSlug);

  const handledGitlabConnectedRef = useRef(false);
  const handledGitlabErrorRef = useRef(false);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode || handledGitlabErrorRef.current) {
      return;
    }

    // Ignore GitHub-specific error codes handled by the GitHub row.
    if (errorCode.startsWith("github_") || errorCode === "missing_callback_params") {
      return;
    }

    handledGitlabErrorRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url.toString());

    toast.error(getGitlabConnectErrorMessage(intl, errorCode));
  }, [intl, searchParams]);

  useEffect(() => {
    if (searchParams.get("gitlab_connected") !== "1" || handledGitlabConnectedRef.current) {
      return;
    }

    handledGitlabConnectedRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("gitlab_connected");
    window.history.replaceState(null, "", url.toString());

    void (async () => {
      await refetchConnection();
      await queryClient.invalidateQueries({
        queryKey: ["gitlab-connection-projects", organizationSlug],
      });
      setExpanded(true);
      toast.success(intl.formatMessage(gitlabIntegrationRowMessages.connectedToast));
    })();
  }, [intl, organizationSlug, queryClient, refetchConnection, searchParams]);

  const { data: projects = [], isLoading: isLoadingProjects } = useGitLabProjects(
    organizationSlug,
    Boolean(connection),
  );
  const { refetch: getInstallUrl, isFetching: isCreatingInstallUrl } =
    useInstallUrl(organizationSlug);
  const syncProjects = useSyncProjects(organizationSlug, intl);
  const updateProjects = useUpdateProjects(organizationSlug, intl);
  const disconnect = useDisconnectConnection(organizationSlug, intl);
  const [query, setQuery] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string> | null>(null);

  const effectiveSelection = useMemo(() => {
    if (selectedProjectIds) {
      return selectedProjectIds;
    }

    return new Set(
      projects.filter((project) => project.enabled).map((project) => project.gitlabProjectId),
    );
  }, [projects, selectedProjectIds]);
  const selectionChanged = useMemo(
    () =>
      projects.some(
        (project) => effectiveSelection.has(project.gitlabProjectId) !== project.enabled,
      ),
    [effectiveSelection, projects],
  );

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return projects;
    }

    return projects.filter((project) =>
      project.pathWithNamespace.toLowerCase().includes(normalizedQuery),
    );
  }, [query, projects]);

  const handleConnect = useCallback(async () => {
    const { data: url } = await getInstallUrl();
    if (url) {
      window.location.href = url;
    } else {
      toast.error(intl.formatMessage(gitlabIntegrationRowMessages.installUrlFailedToast));
    }
  }, [getInstallUrl, intl]);

  const toggleProject = useCallback(
    (projectId: string) => {
      const next = new Set(effectiveSelection);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      setSelectedProjectIds(next);
    },
    [effectiveSelection],
  );

  const handleEnableSelected = useCallback(() => {
    updateProjects.mutate([...effectiveSelection], {
      onSuccess: () => setSelectedProjectIds(null),
    });
  }, [effectiveSelection, updateProjects]);

  const handleEnableAll = useCallback(() => {
    const allProjectIds = projects.map((project) => project.gitlabProjectId);
    updateProjects.mutate(allProjectIds);
    setSelectedProjectIds(new Set(allProjectIds));
  }, [projects, updateProjects]);

  const connected = Boolean(connection);
  const hasEnabledProjects =
    (connection?.enabledProjectCount ?? projects.filter((project) => project.enabled).length) > 0;

  const description = useMemo(() => {
    if (!connection) {
      return intl.formatMessage(gitlabIntegrationRowMessages.disconnectedDescription);
    }

    const projectSummary = intl.formatMessage(gitlabIntegrationRowMessages.projectSummary, {
      enabledCount: connection.enabledProjectCount ?? 0,
      totalCount: connection.projectCount ?? projects.length,
    });

    return connection.username
      ? intl.formatMessage(gitlabIntegrationRowMessages.connectedAsDescription, {
          username: connection.username,
          projectSummary,
        })
      : intl.formatMessage(gitlabIntegrationRowMessages.connectedDescription, { projectSummary });
  }, [connection, intl, projects.length]);

  const action = !userCanManage ? "view-only" : connected ? "manage" : "connect";

  return (
    <IntegrationRow
      name={intl.formatMessage(gitlabIntegrationRowMessages.name)}
      description={description}
      icon={<SimpleBrandIcon icon={siGitlab} colored={hasEnabledProjects} />}
      iconMuted={!hasEnabledProjects}
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
              : intl.formatMessage(gitlabIntegrationRowMessages.loadError)}
          </TypographyP>
          <Button variant="outline" size="sm" onClick={() => void refetchConnection()}>
            <FormattedMessage {...gitlabIntegrationRowMessages.retry} />
          </Button>
        </div>
      ) : connected ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncProjects.mutate()}
              disabled={syncProjects.isPending}
              title={intl.formatMessage(gitlabIntegrationRowMessages.refreshProjectListTitle)}
            >
              <HugeiconsIcon icon={Refresh01Icon} strokeWidth={1.8} className="size-4" />
              {syncProjects.isPending ? (
                <FormattedMessage {...gitlabIntegrationRowMessages.refreshingProjectList} />
              ) : (
                <FormattedMessage {...gitlabIntegrationRowMessages.refreshProjectList} />
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
                <FormattedMessage {...gitlabIntegrationRowMessages.disconnecting} />
              ) : (
                <FormattedMessage {...gitlabIntegrationRowMessages.disconnect} />
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
                    gitlabIntegrationRowMessages.searchProjectsPlaceholder,
                  )}
                  aria-label={intl.formatMessage(
                    gitlabIntegrationRowMessages.searchProjectsAriaLabel,
                  )}
                  className="h-9 w-full rounded-lg border border-border bg-background px-9 text-sm text-foreground transition-all outline-none placeholder:text-muted-foreground focus:border-input focus:ring-[3px] focus:ring-border"
                />
              </div>
              {selectionChanged ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnableSelected}
                  disabled={updateProjects.isPending || projects.length === 0}
                >
                  <FormattedMessage
                    {...gitlabIntegrationRowMessages.enableSelected}
                    values={{ count: effectiveSelection.size }}
                  />
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnableAll}
                disabled={
                  updateProjects.isPending ||
                  projects.length === 0 ||
                  effectiveSelection.size === projects.length
                }
              >
                <FormattedMessage {...gitlabIntegrationRowMessages.enableAll} />
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="grid grid-cols-[48px_minmax(0,1fr)_160px] border-b border-border bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <div className="px-4 py-3">
                  <span className="sr-only">
                    <FormattedMessage {...gitlabIntegrationRowMessages.enabledColumnSrOnly} />
                  </span>
                </div>
                <div className="px-4 py-3">
                  <FormattedMessage {...gitlabIntegrationRowMessages.projectsColumn} />
                </div>
                <div className="px-4 py-3">
                  <FormattedMessage {...gitlabIntegrationRowMessages.branchColumn} />
                </div>
              </div>
              {isLoadingProjects ? (
                <div className="p-4">
                  <Skeleton className="h-10 rounded-lg" />
                </div>
              ) : filteredProjects.length > 0 ? (
                filteredProjects.map((project) => {
                  const checked = effectiveSelection.has(project.gitlabProjectId);
                  return (
                    <label
                      key={project.gitlabProjectId}
                      className={cn(
                        "grid min-h-12 cursor-pointer grid-cols-[48px_minmax(0,1fr)_160px] items-center border-b border-border text-sm transition-colors last:border-b-0 hover:bg-accent/50",
                        checked && "bg-muted/30",
                      )}
                    >
                      <div className="px-4">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProject(project.gitlabProjectId)}
                          className="size-4 rounded border-input accent-foreground"
                          aria-label={intl.formatMessage(
                            gitlabIntegrationRowMessages.enableProjectAriaLabel,
                            { pathWithNamespace: project.pathWithNamespace },
                          )}
                        />
                      </div>
                      <div className="min-w-0 px-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <SimpleBrandIcon
                            icon={siGitlab}
                            colored={checked}
                            className="size-4 shrink-0"
                          />
                          <span className="truncate">{project.pathWithNamespace}</span>
                          {project.private ? (
                            <Badge
                              variant="outline"
                              className="border-border bg-secondary text-secondary-foreground"
                            >
                              <FormattedMessage {...gitlabIntegrationRowMessages.privateBadge} />
                            </Badge>
                          ) : null}
                          {project.archived ? (
                            <Badge
                              variant="outline"
                              className="border-border bg-accent text-accent-foreground"
                            >
                              <FormattedMessage {...gitlabIntegrationRowMessages.archivedBadge} />
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-2 px-4 text-muted-foreground">
                        <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />
                        <span className="truncate">
                          {project.defaultBranch ??
                            intl.formatMessage(gitlabIntegrationRowMessages.defaultBranchFallback)}
                        </span>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {projects.length === 0 ? (
                    <FormattedMessage {...gitlabIntegrationRowMessages.noProjectsAvailable} />
                  ) : (
                    <FormattedMessage {...gitlabIntegrationRowMessages.noProjectsMatchSearch} />
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
