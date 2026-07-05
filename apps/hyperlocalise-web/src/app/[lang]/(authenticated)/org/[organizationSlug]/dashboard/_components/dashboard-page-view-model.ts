import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";

import type { ApiJob } from "../../jobs/_components/jobs-page-view";
import type { ProjectListRow } from "../../projects/_components/project-list";
import type { RecentProjectVisit } from "../../projects/_components/recent-projects";

export type DashboardIntegrationId = "tms" | "github" | "slack";

export type DashboardIntegrationItem = {
  id: DashboardIntegrationId;
  label: string;
  description: string;
  connected: boolean;
  providerKind?: ProjectListRow["externalProviderKind"];
};

export type DashboardJobItem = {
  id: string;
  name: string;
  projectName: string | null;
  kindLabel: string;
  status: ApiJob["status"];
  updatedAt: string;
  href: string | null;
};

export type DashboardProjectItem = {
  id: string;
  name: string;
  sourceLabel: string;
  localeRoute: string;
  pendingActionCount: number;
  updatedAt: string | null;
  href: string;
};

export type DashboardAutomationRunItem = {
  id: string;
  automationId: string;
  automationName: string;
  status: WorkspaceAutomationRunRecord["status"];
  triggerSource: WorkspaceAutomationRunRecord["triggerSource"];
  completedAt: string | null;
  href: string;
};

export type DashboardHeroState =
  | {
      mode: "setup";
      title: string;
      description: string;
      completedCount: number;
      totalCount: number;
      ctaLabel: string;
      ctaHref: string;
    }
  | {
      mode: "attention" | "caught-up";
      pendingCount: number;
      title: string;
      description: string;
      ctaLabel: string;
      ctaHref: string;
    };

const JOB_STATUS_PRIORITY: Record<ApiJob["status"], number> = {
  waiting_for_review: 0,
  failed: 1,
  running: 2,
  queued: 3,
  succeeded: 4,
  cancelled: 5,
};

function mergeDashboardSources<T extends { id: string }>(
  primary: readonly T[],
  secondary: readonly T[],
) {
  const itemsById = new Map(primary.map((item) => [item.id, item]));
  for (const item of secondary) {
    itemsById.set(item.id, item);
  }
  return [...itemsById.values()];
}

export function mergeDashboardJobSources<T extends Pick<ApiJob, "id">>(
  nativeJobs: readonly T[],
  tmsJobs: readonly T[],
) {
  return mergeDashboardSources(nativeJobs, tmsJobs);
}

export function mergeDashboardProjectSources(
  nativeProjects: readonly ProjectListRow[],
  tmsProjects: readonly ProjectListRow[],
) {
  return mergeDashboardSources(nativeProjects, tmsProjects);
}

export function formatDashboardLocaleRoute(
  sourceLocale: string | null,
  targetLocales: readonly string[],
) {
  const source = sourceLocale ?? "—";
  if (targetLocales.length === 0) {
    return source;
  }

  const preview = targetLocales.slice(0, 2).join(", ");
  const suffix = targetLocales.length > 2 ? ` +${targetLocales.length - 2}` : "";
  return `${source} → ${preview}${suffix}`;
}

export function resolveDashboardIntegrations(input: {
  tmsConnected: boolean;
  tmsProviderKind?: ProjectListRow["externalProviderKind"];
  tmsProviderName?: string;
  githubConnected: boolean;
  slackConnected: boolean;
}): DashboardIntegrationItem[] {
  return [
    {
      id: "tms",
      label: input.tmsProviderName ?? "Translation management",
      description: input.tmsProviderName
        ? `${input.tmsProviderName} projects and translation work are available.`
        : "Connect Crowdin, Lokalise, Phrase, or Smartling.",
      connected: input.tmsConnected,
      providerKind: input.tmsProviderKind,
    },
    {
      id: "github",
      label: "GitHub",
      description: "Sync localized strings and run validation on push.",
      connected: input.githubConnected,
    },
    {
      id: "slack",
      label: "Slack",
      description: "Get review notifications and agent handoffs in Slack.",
      connected: input.slackConnected,
    },
  ];
}

export function isDashboardSetupComplete(
  integrations: readonly DashboardIntegrationItem[],
  projectCount: number,
) {
  return integrations.every((item) => item.connected) && projectCount > 0;
}

export function resolveWorkspacePendingActionCount(input: {
  projects: readonly Pick<ProjectListRow, "openJobCount">[];
  jobs: readonly Pick<ApiJob, "status">[];
}) {
  const openJobsFromProjects = input.projects.reduce(
    (total, project) => total + project.openJobCount,
    0,
  );
  const actionableAssignedJobs = input.jobs.filter(
    (job) => job.status === "waiting_for_review" || job.status === "failed",
  ).length;

  return openJobsFromProjects + actionableAssignedJobs;
}

export function resolveDashboardHero(input: {
  integrations: readonly DashboardIntegrationItem[];
  projectCount: number;
  pendingCount: number;
  integrationsHref: string;
  myJobsHref: string;
  newRequestHref: string;
}): DashboardHeroState {
  const connectedCount = input.integrations.filter((item) => item.connected).length;
  const completedCount = connectedCount + (input.projectCount > 0 ? 1 : 0);
  const setupComplete = isDashboardSetupComplete(input.integrations, input.projectCount);

  if (!setupComplete) {
    return {
      mode: "setup",
      title: "Get your workspace ready",
      description:
        "Connect your tools and create a project so Hyperlocalise can route translation work to you.",
      completedCount,
      totalCount: input.integrations.length + 1,
      ctaLabel: "Finish setup",
      ctaHref: input.integrationsHref,
    };
  }

  if (input.pendingCount === 0) {
    return {
      mode: "caught-up",
      pendingCount: 0,
      title: "You're all caught up",
      description:
        "No pending actions right now. Start a new request or browse projects when you're ready to continue.",
      ctaLabel: "New request",
      ctaHref: input.newRequestHref,
    };
  }

  return {
    mode: "attention",
    pendingCount: input.pendingCount,
    title: "A few things need your attention",
    description: `${input.pendingCount} pending ${input.pendingCount === 1 ? "action" : "actions"} across your workspace.`,
    ctaLabel: "View my jobs",
    ctaHref: input.myJobsHref,
  };
}

export function sortDashboardJobs<T extends Pick<ApiJob, "status" | "updatedAt">>(
  jobs: readonly T[],
) {
  return [...jobs].toSorted((left, right) => {
    const priorityDelta = JOB_STATUS_PRIORITY[left.status] - JOB_STATUS_PRIORITY[right.status];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function sortDashboardLatestJobs<T extends Pick<ApiJob, "updatedAt">>(jobs: readonly T[]) {
  return [...jobs].toSorted(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function sortDashboardProjects(
  projects: readonly ProjectListRow[],
  recentVisits: readonly RecentProjectVisit[] = [],
) {
  const visitedAtByProjectId = new Map(
    recentVisits.map((visit) => [visit.projectId, visit.visitedAt]),
  );

  return [...projects].toSorted((left, right) => {
    const leftVisitedAt = visitedAtByProjectId.get(left.id);
    const rightVisitedAt = visitedAtByProjectId.get(right.id);

    if (leftVisitedAt !== undefined || rightVisitedAt !== undefined) {
      if (leftVisitedAt === undefined) {
        return 1;
      }
      if (rightVisitedAt === undefined) {
        return -1;
      }
      return rightVisitedAt - leftVisitedAt;
    }

    const pendingDelta = right.openJobCount - left.openJobCount;
    if (pendingDelta !== 0) {
      return pendingDelta;
    }

    const leftUpdated = left.lastSyncedAt ?? left.updated;
    const rightUpdated = right.lastSyncedAt ?? right.updated;
    return new Date(rightUpdated).getTime() - new Date(leftUpdated).getTime();
  });
}

export function mapDashboardAutomationRuns(input: {
  organizationSlug: string;
  automations: readonly WorkspaceAutomationRecord[];
  runs: readonly WorkspaceAutomationRunRecord[];
  limit?: number;
}): DashboardAutomationRunItem[] {
  const automationNameById = new Map(
    input.automations.map((automation) => [automation.id, automation.name]),
  );

  return [...input.runs]
    .toSorted(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, input.limit ?? 5)
    .map((run) => ({
      id: run.id,
      automationId: run.automationId,
      automationName: automationNameById.get(run.automationId) ?? "Automation",
      status: run.status,
      triggerSource: run.triggerSource,
      completedAt: run.completedAt,
      href: `/org/${input.organizationSlug}/automations/${run.automationId}`,
    }));
}

export function resolveAutomationSnapshotStats(automations: readonly WorkspaceAutomationRecord[]) {
  const visible = automations.filter((automation) => automation.status !== "archived");
  return {
    total: visible.length,
    active: visible.filter((automation) => automation.status === "active").length,
    paused: visible.filter((automation) => automation.status === "paused").length,
  };
}
