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
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpenTextIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { useProjectPageQuery } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/project-page-shell";
import { getKnowledgeMemory } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/_components/knowledge-memory-api";
import { knowledgeMemoryPreviewQueryKey } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/_components/knowledge-memory-query";
import { buildOrganizationPath, buildProjectPath } from "@/components/app-shell/navigation-config";
import { MarkdownPreview } from "@/components/markdown-editor/markdown-editor";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { readApiError } from "@/lib/api-error";

import { contentEditorGuidelineSheetMessages as messages } from "./content-editor-guideline-sheet.messages";

type GuidelineTab = "style-guide" | "project-guideline" | "workspace-guideline";

function isGuidelineTab(value: unknown): value is GuidelineTab {
  return (
    value === "style-guide" || value === "project-guideline" || value === "workspace-guideline"
  );
}

function GuidelineLink({
  href,
  label,
  onNavigate,
  variant,
}: {
  href: string;
  label: MessageDescriptor;
  onNavigate: () => void;
  variant: "default" | "outline";
}) {
  return (
    <Button
      nativeButton={false}
      variant={variant}
      size="sm"
      render={<Link href={href} />}
      onClick={onNavigate}
    >
      <FormattedMessage {...label} />
    </Button>
  );
}

function GuidelineDocument({
  value,
  emptyMessage,
  isLoading,
  isError,
  actionHref,
  actionLabel,
  onNavigate,
}: {
  value: string;
  emptyMessage: string;
  isLoading: boolean;
  isError: boolean;
  actionHref: string | null;
  actionLabel: MessageDescriptor | null;
  onNavigate: () => void;
}) {
  const action =
    actionHref && actionLabel ? (
      <GuidelineLink
        href={actionHref}
        label={actionLabel}
        onNavigate={onNavigate}
        variant={value.trim() ? "outline" : "default"}
      />
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-md">
      {isLoading ? (
        <div className="space-y-3 p-5" aria-busy="true">
          <span className="sr-only">
            <FormattedMessage {...messages.loading} />
          </span>
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : null}

      {isError ? (
        <p className="p-5 text-sm text-pretty text-flame-100">
          <FormattedMessage {...messages.loadError} />
        </p>
      ) : null}

      {!isLoading && !isError && value.trim() ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <MarkdownPreview value={value} chrome="minimal" className="bg-transparent" />
          </div>
          {action ? (
            <div className="flex justify-end border-t border-border bg-muted/40 px-4 py-3">
              {action}
            </div>
          ) : null}
        </>
      ) : null}

      {!isLoading && !isError && !value.trim() ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <div
            className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <HugeiconsIcon icon={BookOpenTextIcon} strokeWidth={1.75} className="size-5" />
          </div>
          <p className="max-w-xs text-sm text-pretty text-muted-foreground">{emptyMessage}</p>
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function ContentEditorGuidelineSheet({
  organizationSlug,
  projectId,
  open,
  onOpenChange,
  canWriteProjects = false,
}: {
  organizationSlug: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWriteProjects?: boolean;
}) {
  const intl = useIntl();
  const [tab, setTab] = useState<GuidelineTab>("style-guide");
  const projectQuery = useProjectPageQuery(organizationSlug, projectId, { enabled: open });
  const project = projectQuery.data;
  const styleGuideContent = project?.translationContextValue ?? "";
  const canEditStyleGuide = canWriteProjects && project?.source === "native";
  const settingsHref = buildProjectPath(organizationSlug, projectId, "settings");
  const projectKnowledgeHref = buildProjectPath(organizationSlug, projectId, "knowledge");
  const workspaceKnowledgeHref = buildOrganizationPath(organizationSlug, "knowledge");

  const projectMemoryQuery = useQuery({
    queryKey: knowledgeMemoryPreviewQueryKey(organizationSlug, projectId),
    enabled: open,
    queryFn: async () => {
      const response = await getKnowledgeMemory({ organizationSlug, projectId });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to load project guideline"));
      }
      const body = await response.json();
      return body.knowledgeMemory?.content ?? "";
    },
  });

  const workspaceMemoryQuery = useQuery({
    queryKey: knowledgeMemoryPreviewQueryKey(organizationSlug),
    enabled: open,
    queryFn: async () => {
      const response = await getKnowledgeMemory({ organizationSlug });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to load workspace guideline"));
      }
      const body = await response.json();
      return body.knowledgeMemory?.content ?? "";
    },
  });

  const close = () => onOpenChange(false);
  const documentByTab = {
    "style-guide": {
      value: styleGuideContent,
      emptyMessage: intl.formatMessage(messages.emptyStyleGuide),
      isLoading: projectQuery.isLoading,
      isError: projectQuery.isError,
      actionHref: canEditStyleGuide ? settingsHref : null,
      actionLabel: canEditStyleGuide ? messages.editStyleGuide : null,
    },
    "project-guideline": {
      value: projectMemoryQuery.data ?? "",
      emptyMessage: intl.formatMessage(messages.emptyProjectGuideline),
      isLoading: projectMemoryQuery.isLoading,
      isError: projectMemoryQuery.isError,
      actionHref: projectKnowledgeHref,
      actionLabel: messages.editProjectGuideline,
    },
    "workspace-guideline": {
      value: workspaceMemoryQuery.data ?? "",
      emptyMessage: intl.formatMessage(messages.emptyWorkspaceGuideline),
      isLoading: workspaceMemoryQuery.isLoading,
      isError: workspaceMemoryQuery.isError,
      actionHref: workspaceKnowledgeHref,
      actionLabel: messages.editWorkspaceGuideline,
    },
  } satisfies Record<
    GuidelineTab,
    {
      value: string;
      emptyMessage: string;
      isLoading: boolean;
      isError: boolean;
      actionHref: string | null;
      actionLabel: MessageDescriptor | null;
    }
  >;
  const activeDocument = documentByTab[tab];
  const descriptionByTab = {
    "style-guide": messages.descriptionStyleGuide,
    "project-guideline": messages.descriptionProjectGuideline,
    "workspace-guideline": messages.descriptionWorkspaceGuideline,
  } satisfies Record<GuidelineTab, MessageDescriptor>;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden bg-background p-0 sm:max-w-xl"
        aria-busy={projectQuery.isFetching}
      >
        <SheetHeader className="border-b border-border pe-14">
          <SheetTitle>
            <FormattedMessage {...messages.title} />
          </SheetTitle>
          <SheetDescription>
            <FormattedMessage {...descriptionByTab[tab]} />
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (isGuidelineTab(value)) {
              setTab(value);
            }
          }}
          className="min-h-0 flex-1 gap-0 bg-muted"
        >
          <div className="px-4 pt-4">
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger
                value="style-guide"
                className="h-auto whitespace-normal px-2 py-2 leading-snug"
              >
                <FormattedMessage {...messages.tabStyleGuide} />
              </TabsTrigger>
              <TabsTrigger
                value="project-guideline"
                className="h-auto whitespace-normal px-2 py-2 leading-snug"
              >
                <FormattedMessage {...messages.tabProjectGuideline} />
              </TabsTrigger>
              <TabsTrigger
                value="workspace-guideline"
                className="h-auto whitespace-normal px-2 py-2 leading-snug"
              >
                <FormattedMessage {...messages.tabWorkspaceGuideline} />
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4">
            <GuidelineDocument {...activeDocument} onNavigate={close} />
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
