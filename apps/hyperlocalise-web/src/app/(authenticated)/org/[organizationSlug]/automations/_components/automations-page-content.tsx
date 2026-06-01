"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Add01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import {
  WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES,
  listWorkspaceAutomationTemplates,
  type WorkspaceAutomationTemplateCategory,
} from "@/lib/agents/workspace-automation-templates";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { AutomationTemplateFlow } from "./automation-template-flow";

const TEMPLATE_FILTER_TABS_CLASS =
  "h-auto flex-none rounded-full border-transparent px-3 py-1.5 text-muted-foreground shadow-none after:hidden hover:text-foreground data-active:bg-foreground/10 data-active:text-foreground dark:data-active:border-transparent dark:data-active:bg-foreground/10";

function formatRelativeTimestamp(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) {
    return `${Math.max(diffHours, 1)}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function AutomationToolsSummary({ automation }: { automation: WorkspaceAutomationRecord }) {
  const tools: string[] = [];
  if (automation.toolConfig.github?.enabled) {
    tools.push("GitHub");
  }
  if (automation.toolConfig.slack?.enabled) {
    tools.push("Slack");
  }
  if (automation.toolConfig.email?.enabled) {
    tools.push("Email");
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tools.map((tool) => (
        <Badge key={tool} variant="outline">
          {tool}
        </Badge>
      ))}
    </div>
  );
}

export function AutomationsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const [templateCategoryFilter, setTemplateCategoryFilter] =
    useState<WorkspaceAutomationTemplateCategory>("popular");

  const automationsQuery = useQuery({
    queryKey: ["workspace-automations", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations.$get({
        param: { organizationSlug },
        query: { limit: "100", offset: "0" },
      });
      if (!response.ok) {
        throw new Error("Failed to load automations");
      }
      const body = await response.json();
      return body.automations as WorkspaceAutomationRecord[];
    },
  });

  const automations = automationsQuery.data ?? [];
  const visibleAutomations = useMemo(
    () => automations.filter((automation) => automation.status !== "archived"),
    [automations],
  );

  const stats = useMemo(() => {
    const active = visibleAutomations.filter((automation) => automation.status === "active").length;
    const paused = visibleAutomations.filter((automation) => automation.status === "paused").length;
    return {
      total: visibleAutomations.length,
      active,
      paused,
    };
  }, [visibleAutomations]);

  const templates = useMemo(() => {
    const categoryOrder = WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES.map((category) => category.id);

    return listWorkspaceAutomationTemplates().toSorted((left, right) => {
      const leftIndex = categoryOrder.indexOf(left.category);
      const rightIndex = categoryOrder.indexOf(right.category);
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return left.name.localeCompare(right.name);
    });
  }, []);

  const templateCategoryTabs = useMemo(() => {
    const counts = new Map<WorkspaceAutomationTemplateCategory, number>();
    for (const template of templates) {
      counts.set(template.category, (counts.get(template.category) ?? 0) + 1);
    }

    return WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES.filter((category) => counts.has(category.id));
  }, [templates]);

  const filteredTemplates = useMemo(
    () => templates.filter((template) => template.category === templateCategoryFilter),
    [templateCategoryFilter, templates],
  );

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={SparklesIcon}
        label="Workspace"
        title="Automations"
        description="Automate repetitive tasks with always-on workflows that respond to schedules and GitHub pushes."
        actions={
          <Button
            nativeButton={false}
            render={<Link href={`/org/${organizationSlug}/automations/new`} />}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            New Automation
          </Button>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total automations</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-3xl">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Paused</CardDescription>
            <CardTitle className="text-3xl">{stats.paused}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-foreground/10">
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.5fr)] gap-4 border-b border-foreground/10 px-4 py-3 text-xs font-medium text-muted-foreground">
            <span>Automation</span>
            <span>Tools</span>
            <span>Status</span>
            <span>Created</span>
          </div>
          {visibleAutomations.length === 0 ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">
              No automations yet. Start from a template below or create a new automation.
            </div>
          ) : (
            visibleAutomations.map((automation) => (
              <Link
                key={automation.id}
                href={`/org/${organizationSlug}/automations/${automation.id}`}
                className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.5fr)] gap-4 border-b border-foreground/10 px-4 py-4 transition-colors last:border-b-0 hover:bg-foreground/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{automation.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {automation.triggerConfig.mode === "scheduled"
                      ? "Scheduled"
                      : automation.triggerConfig.mode === "github"
                        ? "GitHub push"
                        : "Manual"}
                  </p>
                </div>
                <AutomationToolsSummary automation={automation} />
                <Badge variant={automation.status === "active" ? "default" : "secondary"}>
                  {automation.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatRelativeTimestamp(automation.createdAt)}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-sans text-base font-medium text-balance text-foreground">
            Templates
          </h2>
          <TypographyP className="text-muted-foreground">
            Start from a curated workflow. Templates prefill the creation form with instructions,
            triggers, and tools.
          </TypographyP>
        </div>
        <Tabs
          value={templateCategoryFilter}
          onValueChange={(value) =>
            setTemplateCategoryFilter(value as WorkspaceAutomationTemplateCategory)
          }
          className="gap-5"
        >
          <TabsList
            variant="line"
            className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0"
          >
            {templateCategoryTabs.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className={TEMPLATE_FILTER_TABS_CLASS}
              >
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((template) => (
              <Card key={template.id} size="sm" className="gap-4 px-5 py-5">
                <AutomationTemplateFlow template={template} />
                <div className="space-y-1.5">
                  <h3 className="text-sm font-medium text-foreground">{template.name}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {template.description}
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-2">
                  {template.activatable ? (
                    <Button
                      size="sm"
                      className="rounded-full"
                      nativeButton={false}
                      render={
                        <Link
                          href={`/org/${organizationSlug}/automations/new?template=${template.id}`}
                        />
                      }
                    >
                      Add
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="rounded-full" disabled>
                      Coming soon
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Tabs>
      </section>
    </WorkspacePageShell>
  );
}
