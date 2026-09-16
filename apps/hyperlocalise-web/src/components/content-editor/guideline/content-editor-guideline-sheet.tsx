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
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";

import { contentEditorGuidelineSheetMessages as messages } from "./content-editor-guideline-sheet.messages";

function GuidelineMarkdownPanel({
  value,
  emptyMessage,
  isLoading,
  isError,
}: {
  value: string;
  emptyMessage: string;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.loading} />
      </TypographyP>
    );
  }

  if (isError) {
    return (
      <TypographyP className="text-flame-100" size="small">
        <FormattedMessage {...messages.loadError} />
      </TypographyP>
    );
  }

  return (
    <MarkdownPreview
      value={value}
      emptyMessage={emptyMessage}
      className="border-border bg-transparent"
    />
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl" aria-busy={projectQuery.isFetching}>
        <SheetHeader>
          <SheetTitle>
            <FormattedMessage {...messages.title} />
          </SheetTitle>
          <SheetDescription>
            <FormattedMessage {...messages.description} />
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="style-guide" className="flex min-h-0 flex-1 flex-col gap-4 px-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="style-guide">
              <FormattedMessage {...messages.tabStyleGuide} />
            </TabsTrigger>
            <TabsTrigger value="project-guideline">
              <FormattedMessage {...messages.tabProjectGuideline} />
            </TabsTrigger>
            <TabsTrigger value="workspace-guideline">
              <FormattedMessage {...messages.tabWorkspaceGuideline} />
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            <TabsContent value="style-guide" className="mt-0">
              <GuidelineMarkdownPanel
                value={styleGuideContent}
                emptyMessage={intl.formatMessage(messages.emptyStyleGuide)}
                isLoading={projectQuery.isLoading}
                isError={projectQuery.isError}
              />
            </TabsContent>
            <TabsContent value="project-guideline" className="mt-0">
              <GuidelineMarkdownPanel
                value={projectMemoryQuery.data ?? ""}
                emptyMessage={intl.formatMessage(messages.emptyProjectGuideline)}
                isLoading={projectMemoryQuery.isLoading}
                isError={projectMemoryQuery.isError}
              />
            </TabsContent>
            <TabsContent value="workspace-guideline" className="mt-0">
              <GuidelineMarkdownPanel
                value={workspaceMemoryQuery.data ?? ""}
                emptyMessage={intl.formatMessage(messages.emptyWorkspaceGuideline)}
                isLoading={workspaceMemoryQuery.isLoading}
                isError={workspaceMemoryQuery.isError}
              />
            </TabsContent>
          </div>
        </Tabs>

        <SheetFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          {canEditStyleGuide ? (
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href={settingsHref} />}
              onClick={() => onOpenChange(false)}
            >
              <FormattedMessage {...messages.editStyleGuide} />
            </Button>
          ) : null}
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href={projectKnowledgeHref} />}
            onClick={() => onOpenChange(false)}
          >
            <FormattedMessage {...messages.editProjectGuideline} />
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href={workspaceKnowledgeHref} />}
            onClick={() => onOpenChange(false)}
          >
            <FormattedMessage {...messages.editWorkspaceGuideline} />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
