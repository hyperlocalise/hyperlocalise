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
import { BookOpenTextIcon, CaretRightIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { useProjectPageQuery } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/project-page-shell";
import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { MarkdownPreview } from "@/components/markdown-editor/markdown-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import {
  guidelineDocumentLocales,
  type GuidelineDocument,
} from "@/lib/go-svc/go-svc-guidelines-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { cn } from "@/lib/primitives/cn";

import { contentEditorGuidelineSheetMessages as messages } from "./content-editor-guideline-sheet.messages";

type GuidelineTab = "style-guide" | "guideline";

function isGuidelineTab(value: unknown): value is GuidelineTab {
  return value === "style-guide" || value === "guideline";
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

function GuidelinePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-md">
      {children}
    </div>
  );
}

function GuidelineEmpty({
  emptyMessage,
  actionHref,
  actionLabel,
  onNavigate,
}: {
  emptyMessage: string;
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
        variant="default"
      />
    ) : null;
  return (
    <GuidelinePanel>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
        <div
          className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <BookOpenTextIcon className="size-5" />
        </div>
        <p className="max-w-xs text-sm text-pretty text-muted-foreground">{emptyMessage}</p>
        {action}
      </div>
    </GuidelinePanel>
  );
}

function GuidelineError({
  actionHref,
  actionLabel,
  onNavigate,
}: {
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
        variant="default"
      />
    ) : null;
  return (
    <GuidelinePanel>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
        <p className="text-sm text-pretty text-flame-100">
          <FormattedMessage {...messages.loadError} />
        </p>
        {action}
      </div>
    </GuidelinePanel>
  );
}

function GuidelineLoading() {
  return (
    <GuidelinePanel>
      <div className="space-y-3 p-5" aria-busy="true">
        <span className="sr-only">
          <FormattedMessage {...messages.loading} />
        </span>
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </GuidelinePanel>
  );
}

function GuidelineStatusBadge({ status }: { status: GuidelineDocument["status"] }) {
  if (status === "ready") {
    return null;
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive">
        <FormattedMessage {...messages.failed} />
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <FormattedMessage {...messages.processing} />
    </Badge>
  );
}

/**
 * One guideline in the sheet. The title links to the document page; the caret
 * expands the extracted text translators and agents see.
 */
function GuidelineDocumentRow({
  document,
  organizationSlug,
  projectId,
  client,
  enabled,
  defaultOpen,
  onNavigate,
}: {
  document: GuidelineDocument;
  organizationSlug: string;
  projectId: string;
  client: GoSvcClient;
  enabled: boolean;
  defaultOpen: boolean;
  onNavigate: () => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(defaultOpen);
  const contentQuery = useQuery({
    queryKey: ["guideline-sheet-document", organizationSlug, projectId, document.id],
    enabled: enabled && open,
    queryFn: async ({ signal }) => {
      const loaded = await client.guidelines.getDocument(organizationSlug, document.id, undefined, {
        signal,
      });
      return loaded.content ?? "";
    },
  });
  const locales = guidelineDocumentLocales(document);
  const localeLabel =
    locales.length > 0 ? locales.join(", ") : intl.formatMessage(messages.allLocales);
  const detailHref = buildProjectPath(
    organizationSlug,
    projectId,
    `knowledge/${encodeURIComponent(document.id)}`,
  );

  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-1 px-3 py-2.5">
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mt-0.5 shrink-0"
                aria-label={intl.formatMessage(
                  open ? messages.hideDocument : messages.showDocument,
                  { title: document.title },
                )}
              />
            }
          >
            <CaretRightIcon
              aria-hidden="true"
              className={cn("size-4 transition-transform", open && "rotate-90")}
            />
          </CollapsibleTrigger>
          <div className="min-w-0 flex-1 py-1">
            <Link
              href={detailHref}
              className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
              onClick={onNavigate}
            >
              {document.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{localeLabel}</span>
              {document.mandatory ? (
                <Badge variant="outline">
                  <FormattedMessage {...messages.alwaysApply} />
                </Badge>
              ) : null}
              <GuidelineStatusBadge status={document.status} />
            </div>
          </div>
        </div>
        <CollapsibleContent>
          <div className="px-5 pb-5 ps-12">
            {contentQuery.isPending ? (
              <div className="space-y-3" aria-busy="true">
                <span className="sr-only">
                  <FormattedMessage {...messages.loading} />
                </span>
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
              </div>
            ) : null}
            {contentQuery.isError ? (
              <p className="text-sm text-pretty text-flame-100">
                <FormattedMessage {...messages.loadError} />
              </p>
            ) : null}
            {contentQuery.data != null && !contentQuery.data.trim() ? (
              <p className="text-sm text-pretty text-muted-foreground">
                <FormattedMessage {...messages.previewUnavailable} />
              </p>
            ) : null}
            {contentQuery.data?.trim() ? (
              <MarkdownPreview
                value={contentQuery.data}
                chrome="minimal"
                className="bg-transparent"
              />
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function GuidelineDocumentList({
  documents,
  organizationSlug,
  projectId,
  client,
  enabled,
  emptyMessage,
  actionHref,
  actionLabel,
  onNavigate,
}: {
  documents: GuidelineDocument[];
  organizationSlug: string;
  projectId: string;
  client: GoSvcClient;
  enabled: boolean;
  emptyMessage: string;
  actionHref: string | null;
  actionLabel: MessageDescriptor | null;
  onNavigate: () => void;
}) {
  if (documents.length === 0) {
    return (
      <GuidelineEmpty
        emptyMessage={emptyMessage}
        actionHref={actionHref}
        actionLabel={actionLabel}
        onNavigate={onNavigate}
      />
    );
  }

  const action =
    actionHref && actionLabel ? (
      <GuidelineLink
        href={actionHref}
        label={actionLabel}
        onNavigate={onNavigate}
        variant="outline"
      />
    ) : null;

  return (
    <GuidelinePanel>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {documents.map((document) => (
          <GuidelineDocumentRow
            key={document.id}
            document={document}
            organizationSlug={organizationSlug}
            projectId={projectId}
            client={client}
            enabled={enabled}
            defaultOpen={documents.length === 1}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      {action ? (
        <div className="flex justify-end border-t border-border bg-muted/40 px-4 py-3">
          {action}
        </div>
      ) : null}
    </GuidelinePanel>
  );
}

export function ContentEditorGuidelineSheet({
  organizationSlug,
  projectId,
  open,
  onOpenChange,
  canWriteProjects = false,
  client: clientProp,
}: {
  organizationSlug: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWriteProjects?: boolean;
  client?: GoSvcClient;
}) {
  const intl = useIntl();
  const [tab, setTab] = useState<GuidelineTab>("guideline");
  const { client: hookClient, loading: clientLoading } = useGoSvcClient();
  const client = clientProp ?? hookClient;
  const enabled = open && (clientProp != null || !clientLoading);
  const projectQuery = useProjectPageQuery(organizationSlug, projectId, { enabled: open });
  const project = projectQuery.data;
  const styleGuideContent = project?.translationContextValue ?? "";
  const canEditStyleGuide = canWriteProjects && project?.source === "native";
  const settingsHref = buildProjectPath(organizationSlug, projectId, "settings");
  const projectKnowledgeHref = buildProjectPath(organizationSlug, projectId, "knowledge");

  const workspaceDocsQuery = useQuery({
    queryKey: ["guideline-sheet-workspace-docs", organizationSlug],
    enabled,
    queryFn: ({ signal }) =>
      client.guidelines.listDocuments(organizationSlug, undefined, { signal }),
  });
  const assignmentsQuery = useQuery({
    queryKey: ["guideline-sheet-assignments", organizationSlug],
    enabled,
    queryFn: async ({ signal }) => {
      const body = await client.guidelines.listAllDocumentAssignments(organizationSlug, { signal });
      return new Map(
        body.assignments.map(
          (assignment) => [assignment.documentId, assignment.projectIds] as const,
        ),
      );
    },
  });

  const assignments = assignmentsQuery.data ?? new Map<string, string[]>();
  // Project-owned documents are retired. The list is org documents in scope
  // for this project: global, or explicitly assigned. Unassigned non-global
  // documents apply to no project.
  const isDocumentInProject = (document: GuidelineDocument) => {
    if (document.projectId != null) return false;
    if (document.isGlobal ?? false) return true;
    return assignments.get(document.id)?.includes(projectId) ?? false;
  };
  const documents = (workspaceDocsQuery.data ?? []).filter(isDocumentInProject);

  const close = () => onOpenChange(false);
  const descriptionByTab = {
    "style-guide": messages.descriptionStyleGuide,
    guideline: messages.descriptionGuideline,
  } satisfies Record<GuidelineTab, MessageDescriptor>;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-4xl"
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
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger
                value="guideline"
                className="h-auto whitespace-normal px-2 py-2 leading-snug"
              >
                <FormattedMessage {...messages.tabGuideline} />
              </TabsTrigger>
              <TabsTrigger
                value="style-guide"
                className="h-auto whitespace-normal px-2 py-2 leading-snug"
              >
                <FormattedMessage {...messages.tabStyleGuide} />
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="style-guide" className="flex min-h-0 flex-1 flex-col p-4">
            {projectQuery.isLoading ? (
              <GuidelineLoading />
            ) : projectQuery.isError ? (
              <GuidelineError
                actionHref={canEditStyleGuide ? settingsHref : null}
                actionLabel={canEditStyleGuide ? messages.editStyleGuide : null}
                onNavigate={close}
              />
            ) : styleGuideContent.trim() ? (
              <GuidelinePanel>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  <MarkdownPreview
                    value={styleGuideContent}
                    chrome="minimal"
                    className="bg-transparent"
                  />
                </div>
                {canEditStyleGuide ? (
                  <div className="flex justify-end border-t border-border bg-muted/40 px-4 py-3">
                    <GuidelineLink
                      href={settingsHref}
                      label={messages.editStyleGuide}
                      onNavigate={close}
                      variant="outline"
                    />
                  </div>
                ) : null}
              </GuidelinePanel>
            ) : (
              <GuidelineEmpty
                emptyMessage={intl.formatMessage(messages.emptyStyleGuide)}
                actionHref={canEditStyleGuide ? settingsHref : null}
                actionLabel={canEditStyleGuide ? messages.editStyleGuide : null}
                onNavigate={close}
              />
            )}
          </TabsContent>
          <TabsContent value="guideline" className="flex min-h-0 flex-1 flex-col p-4">
            {workspaceDocsQuery.isPending || assignmentsQuery.isPending ? (
              <GuidelineLoading />
            ) : workspaceDocsQuery.isError || assignmentsQuery.isError ? (
              <GuidelineError
                actionHref={projectKnowledgeHref}
                actionLabel={messages.openKnowledge}
                onNavigate={close}
              />
            ) : (
              <GuidelineDocumentList
                key={documents.map((document) => document.id).join("|")}
                documents={documents}
                organizationSlug={organizationSlug}
                projectId={projectId}
                client={client}
                enabled={enabled}
                emptyMessage={intl.formatMessage(messages.emptyGuideline)}
                actionHref={projectKnowledgeHref}
                actionLabel={messages.openKnowledge}
                onNavigate={close}
              />
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
