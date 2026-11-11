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
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import {
  PlusIcon,
  BookOpenTextIcon,
  TrashIcon,
  DownloadSimpleIcon,
  FunnelIcon,
  UploadSimpleIcon,
  ClockCounterClockwiseIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { GlossaryProjectRecord, GlossaryRecord } from "@/api/routes/glossary/glossary.schema";
import {
  glossaryGenderValues,
  glossaryPartOfSpeechValues,
  glossaryTermStatusValues,
  glossaryTermTypeValues,
} from "@/lib/glossary/glossary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GenderDisplay,
  PartOfSpeechDisplay,
  StatusLabel,
  TermTypeDisplay,
  readableEnumLabel,
} from "@/components/glossary/glossary-term-property-pickers";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { cn } from "@/lib/primitives/cn";

import { glossaryDetailPageContentMessages as messages } from "./glossary-detail-page-content.messages";
import { useGlossary } from "./use-glossary";
import {
  GlossaryDetailPageStoreProvider,
  useGlossaryDetailPageStore,
} from "../store/glossary-detail-store-context";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

function teamControlLevelDisplayLabel(
  glossary: GlossaryRecord,
  intl: ReturnType<typeof useIntl>,
): string {
  const teamName = glossary.teamName?.trim();
  if (teamName) {
    return teamName;
  }

  return intl.formatMessage(messages.controlLevelTeam);
}

function TermStatusSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2",
        compact ? "h-5" : "h-7 w-full",
      )}
      aria-hidden="true"
    >
      <Skeleton className={cn("rounded-full", compact ? "size-2.5" : "size-3")} />
      <Skeleton className={cn("h-2.5", compact ? "w-14" : "w-20")} />
    </span>
  );
}

function ConceptListSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6" aria-busy="true">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </section>
      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid min-w-[760px] grid-cols-[2.5rem_1.4fr_2fr_1fr_1fr_1fr] gap-4 border-b border-border bg-muted/30 px-3 py-3">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-20 max-w-full" />
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className="grid min-w-[760px] grid-cols-[2.5rem_1.4fr_2fr_1fr_1fr_1fr] gap-4 border-b border-border px-3 py-4 last:border-b-0"
            >
              <Skeleton className="size-4 rounded-md" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-36 max-w-full" />
                <TermStatusSkeleton compact />
              </div>
              <Skeleton className="h-4 w-full max-w-xs" />
              <Skeleton className="h-4 w-24 max-w-full" />
              <Skeleton className="h-4 w-28 max-w-full" />
              <Skeleton className="h-4 w-28 max-w-full" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function EnumFilterSelect({
  id,
  label,
  value,
  displayValue,
  onValueChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  displayValue: ReactNode;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  const active = value !== "all";
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? "all")}>
      <SelectTrigger
        id={id}
        aria-label={label}
        className={cn("w-full", active && "border-primary/50 bg-primary/5")}
      >
        <SelectValue>
          <span className="truncate">
            {label}: {displayValue}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export function NativeGlossaryDetail({
  organizationSlug,
  glossaryId,
  canManageGlossaries,
}: {
  organizationSlug: string;
  glossaryId: string;
  canManageGlossaries: boolean;
}) {
  return (
    <GlossaryDetailPageStoreProvider organizationSlug={organizationSlug} glossaryId={glossaryId}>
      <NativeGlossaryDetailView
        organizationSlug={organizationSlug}
        glossaryId={glossaryId}
        canManageGlossaries={canManageGlossaries}
      />
    </GlossaryDetailPageStoreProvider>
  );
}

const NativeGlossaryDetailView = observer(function NativeGlossaryDetailView({
  organizationSlug,
  glossaryId,
  canManageGlossaries,
}: {
  organizationSlug: string;
  glossaryId: string;
  canManageGlossaries: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const store = useGlossaryDetailPageStore();
  const { client: goSvcClient } = useGoSvcClient();
  const glossaryHref = store.glossaryHref;
  const glossaryFileInputRef = useRef<HTMLInputElement>(null);

  const { glossaryQuery, glossary, canManage, canContribute, sourceLanguage } = useGlossary({
    organizationSlug,
    glossaryId,
    canManageGlossaries,
  });

  useEffect(() => {
    if (glossary) store.syncNameDraft(glossary.name);
  }, [glossary?.name, store]);

  const conceptsQuery = useQuery({
    queryKey: [
      "glossary-concepts-page",
      organizationSlug,
      glossaryId,
      store.conceptSearch,
      store.conceptLocale,
      store.conceptModifiedFrom,
      store.conceptLinguisticStatus,
      store.conceptPartOfSpeech,
      store.conceptTermType,
      store.conceptGender,
      store.conceptAuthor,
      store.conceptCursor,
      store.conceptSort,
    ],
    enabled: true,
    queryFn: async () => {
      // Stays on Hono: go-svc's concepts/page only honours limit/cursor/search,
      // so moving this over would silently drop every filter below.
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts.page.$get({
        param: { organizationSlug, glossaryId },
        query: {
          limit: "10",
          sort: "primary_term",
          sortDir: store.conceptSort,
          includeArchived: "false" as const,
          ...(store.conceptSearch.trim() ? { search: store.conceptSearch.trim() } : {}),
          ...(store.conceptLocale ? { locale: store.conceptLocale } : {}),
          ...(store.conceptModifiedFrom ? { modifiedFrom: store.conceptModifiedFrom } : {}),
          ...(store.conceptLinguisticStatus
            ? { linguisticStatus: store.conceptLinguisticStatus }
            : {}),
          ...(store.conceptPartOfSpeech ? { partOfSpeech: store.conceptPartOfSpeech } : {}),
          ...(store.conceptTermType ? { termType: store.conceptTermType } : {}),
          ...(store.conceptGender ? { gender: store.conceptGender } : {}),
          ...(store.conceptAuthor ? { createdByUserId: store.conceptAuthor } : {}),
          ...(store.conceptCursor ? { cursor: store.conceptCursor } : {}),
        },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadConceptsFailed)),
        );
      return await response.json();
    },
    placeholderData: (previous) => previous,
  });

  const attachedProjectsQuery = useQuery({
    queryKey: ["glossary-projects", organizationSlug, glossaryId],
    enabled: true,
    queryFn: async () => {
      try {
        const body = await goSvcClient.glossary.projects.list(organizationSlug, glossaryId);
        return body.projects as GlossaryProjectRecord[];
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.loadProjectsFailed)), {
          cause: error,
        });
      }
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["translation-projects", organizationSlug],
    enabled: true,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadProjectsFailed)),
        );
      return (await response.json()).projects as Array<{
        id: string;
        name: string;
        sourceLocale: string;
      }>;
    },
  });

  const membersQuery = useQuery({
    queryKey: ["org-members", organizationSlug, "glossary-authors"],
    enabled: true,
    queryFn: async () => {
      try {
        return await goSvcClient.member.list(organizationSlug);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.loadAuthorsFailed)), {
          cause: error,
        });
      }
    },
    retry: false,
  });

  const recordedAuthorsQuery = useQuery({
    queryKey: ["glossary-concepts-authors", organizationSlug, glossaryId],
    enabled: true,
    queryFn: async () => {
      try {
        return (await goSvcClient.glossary.concepts.authors(organizationSlug, glossaryId)) as {
          authors: Array<{ userId: string; displayName: string }>;
        };
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.loadAuthorsFailed)), {
          cause: error,
        });
      }
    },
    staleTime: 30_000,
    retry: false,
  });

  // Recorded authors first so former contributors remain selectable even
  // after losing their membership; active members without recorded
  // concepts are appended so they can still be picked.
  const authorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const author of recordedAuthorsQuery.data?.authors ?? [])
      byId.set(author.userId, author.displayName);
    for (const member of membersQuery.data?.members ?? []) {
      if (member.status === "active" && !byId.has(member.userId))
        byId.set(member.userId, member.displayName);
    }
    return [...byId]
      .map(([userId, displayName]) => ({ userId, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [recordedAuthorsQuery.data, membersQuery.data]);
  const concepts = conceptsQuery.data?.concepts ?? [];
  // Initial load renders the full skeleton; subsequent filter/search/sort
  // fetches keep previous data, so surface an explicit refreshing signal.
  const conceptsRefreshing = conceptsQuery.isFetching && !conceptsQuery.isLoading;
  const attachedProjectIds = useMemo(
    () => new Set((attachedProjectsQuery.data ?? []).map((project) => project.projectId)),
    [attachedProjectsQuery.data],
  );
  const availableProjects = (projectsQuery.data ?? []).filter(
    (project) => !attachedProjectIds.has(project.id),
  );

  const invalidateProjects = () =>
    queryClient.invalidateQueries({
      queryKey: ["glossary-projects", organizationSlug, glossaryId],
    });

  const importConcepts = useMutation({
    mutationFn: async (file: File) => {
      const filename = file.name.toLowerCase();
      const isXlsx = filename.endsWith(".xlsx");
      const format = filename.endsWith(".tbx") ? "tbx" : isXlsx ? "xlsx" : "csv";
      const upload = await goSvcClient.glossary.importUpload(organizationSlug, glossaryId, {
        format,
        sourceFilename: file.name,
        contentType: file.type || "application/octet-stream",
      });
      const headers = new Headers();
      for (const [name, values] of Object.entries(upload.upload.headers)) {
        headers.set(name, values.join(","));
      }
      const uploadResponse = await fetch(upload.upload.url, {
        method: upload.upload.method,
        headers,
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(intl.formatMessage(messages.importTermsFailed));
      await goSvcClient.glossary.importFinalize(organizationSlug, glossaryId, {
        reportId: upload.reportId,
        mode: "merge",
        previewForMode: "merge",
        strictLocale: true,
        localeMapping: {},
      });
      return { reportId: upload.reportId };
    },
    onSuccess: ({ reportId }) => {
      store.closeImportDialog();
      if (glossaryFileInputRef.current) glossaryFileInputRef.current.value = "";
      router.push(`${glossaryHref}/imports/${encodeURIComponent(reportId)}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const activeDropdownFilterCount = store.activeDropdownFilterCount;
  const activeFilterCount = store.activeFilterCount;
  const canExportFiltered = store.canExportFiltered;

  const exportGlossary = useMutation({
    mutationFn: async (input: {
      format: "csv" | "tbx" | "xlsx";
      scope: "complete" | "filtered";
      locales?: string[];
      search?: string;
      modifiedFrom?: string;
      linguisticStatus?: string;
      partOfSpeech?: string;
      termType?: string;
      gender?: string;
      createdByUserId?: string;
    }) => {
      const job = await goSvcClient.glossary.createExport(organizationSlug, glossaryId, {
        format: input.format,
        scope: input.scope,
        locales: input.locales,
        search: input.search,
        modifiedFrom: input.modifiedFrom,
        linguisticStatus: input.linguisticStatus,
        partOfSpeech: input.partOfSpeech,
        termType: input.termType,
        gender: input.gender,
        createdByUserId: input.createdByUserId,
      });
      return { reportId: job.reportId };
    },
    onSuccess: ({ reportId }) => {
      store.setExportDialogOpen(false);
      router.push(`${glossaryHref}/imports/${encodeURIComponent(reportId)}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateGlossaryName = useMutation({
    mutationFn: async (name: string) => {
      try {
        const body = await goSvcClient.glossary.update(organizationSlug, glossaryId, { name });
        return body.glossary as GlossaryRecord;
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(messages.updateGlossaryNameFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["glossary", organizationSlug, glossaryId],
      });
      toast.success(intl.formatMessage(messages.glossaryNameUpdated));
    },
  });

  const deleteGlossary = useMutation({
    mutationFn: async () => {
      try {
        await goSvcClient.glossary.delete(organizationSlug, glossaryId);
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(messages.deleteGlossaryFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["glossaries", organizationSlug] }),
        queryClient.invalidateQueries({ queryKey: ["native-glossaries", organizationSlug] }),
      ]);
      toast.success(intl.formatMessage(messages.glossaryDeleted));
      store.setDeleteGlossaryDialogOpen(false);
      router.push(`/org/${organizationSlug}/glossaries`);
    },
    onError: (error) => toast.error(error.message),
  });

  const saveGlossaryName = async () => {
    const name = store.trimmedNameDraft();
    if (!name || !glossary || !store.canSaveName(glossary.name)) {
      store.syncNameDraft(glossary?.name ?? store.nameDraft);
      return;
    }
    try {
      await updateGlossaryName.mutateAsync(name);
    } catch (error) {
      store.syncNameDraft(glossary.name);
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(messages.updateGlossaryNameFailed),
      );
    }
  };

  const attachProject = useMutation({
    mutationFn: async (projectId: string) => {
      try {
        await goSvcClient.glossary.projects.attach(organizationSlug, glossaryId, {
          projectId,
          priority: 0,
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(messages.assignProjectFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: async () => {
      await invalidateProjects();
      store.clearSelectedProjectId();
      toast.success(intl.formatMessage(messages.projectAssigned));
    },
    onError: (error) => toast.error(error.message),
  });

  const detachProject = useMutation({
    mutationFn: async (projectId: string) => {
      try {
        await goSvcClient.glossary.projects.detach(organizationSlug, glossaryId, projectId);
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(messages.removeProjectFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: async () => {
      await invalidateProjects();
      toast.success(intl.formatMessage(messages.projectRemoved));
    },
    onError: (error) => toast.error(error.message),
  });

  if (glossaryQuery.isLoading) return <ConceptListSkeleton />;
  if (!glossary) {
    return (
      <TypographyP className="py-8" size="small" tone="subtle">
        <FormattedMessage {...messages.notFound} />
      </TypographyP>
    );
  }
  if (conceptsQuery.isLoading) return <ConceptListSkeleton />;

  const goToNextConceptPage = () => {
    store.goToNextConceptPage(conceptsQuery.data?.nextCursor);
  };

  const goToPreviousConceptPage = () => {
    store.goToPreviousConceptPage();
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpenTextIcon className="size-5 text-muted-foreground" />
          <Badge variant="outline">
            {glossary.controlLevel === "team" ? (
              teamControlLevelDisplayLabel(glossary, intl)
            ) : (
              <FormattedMessage {...messages.controlLevelOrg} />
            )}
          </Badge>
          {glossary.languages.map((language) => (
            <Badge
              key={language.locale}
              variant="outline"
              className={
                language.isSource
                  ? "border-emerald-500/30 text-emerald-700"
                  : "border-amber-500/30 text-amber-700"
              }
            >
              {language.name} <span className="ml-1 text-[10px] opacity-70">{language.locale}</span>
            </Badge>
          ))}
        </div>
        {canManage ? (
          <>
            <TypographyH1 className="sr-only">{glossary.name}</TypographyH1>
            <Textarea
              value={store.nameDraft}
              onChange={(event) => store.setNameDraft(event.currentTarget.value)}
              onBlur={() => {
                if (store.consumeSkipNameBlurSave()) return;
                void saveGlossaryName();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  store.revertNameDraft(glossary.name);
                  event.currentTarget.blur();
                }
              }}
              disabled={updateGlossaryName.isPending}
              aria-label={intl.formatMessage(messages.editName)}
              rows={1}
              className={cn(
                "font-heading min-h-14 shrink-0 resize-none overflow-hidden rounded-none border-transparent bg-transparent px-0 py-1 text-3xl font-semibold text-balance text-foreground shadow-none md:text-5xl lg:text-6xl",
                "focus-visible:border-transparent focus-visible:ring-0",
              )}
            />
          </>
        ) : (
          <TypographyH1
            className="text-3xl md:text-5xl lg:text-6xl"
            weight="bold"
            wrapStyle="balance"
          >
            {glossary.name}
          </TypographyH1>
        )}
        <TypographyP className="max-w-3xl leading-6" size="small" tone="subtle">
          {glossary.description || intl.formatMessage(messages.descriptionFallback)}
        </TypographyP>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            render={<Link href={`${glossaryHref}/history`} />}
          >
            <ClockCounterClockwiseIcon data-icon="inline-start" />
            <FormattedMessage {...messages.glossaryHistory} />
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href={`${glossaryHref}/imports`} />}
          >
            <ClockCounterClockwiseIcon data-icon="inline-start" />
            <FormattedMessage {...messages.glossaryInterchangeHistory} />
          </Button>
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => store.setDeleteGlossaryDialogOpen(true)}
              disabled={deleteGlossary.isPending}
            >
              <TrashIcon data-icon="inline-start" />
              <FormattedMessage {...messages.deleteGlossary} />
            </Button>
          ) : null}
        </div>
      </section>

      <>
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <TypographyP size="small" weight="medium" tone="content">
                  <FormattedMessage {...messages.conceptsTitle} />
                </TypographyP>
                <TypographyP size="xsmall" tone="subtle">
                  <FormattedMessage {...messages.conceptsDescription} />
                </TypographyP>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={activeDropdownFilterCount > 0 ? "default" : "outline"}
                  onClick={() => store.openFilterDialog()}
                >
                  <FunnelIcon data-icon="inline-start" />
                  <FormattedMessage {...messages.filtersButton} />
                  {activeDropdownFilterCount > 0 ? ` (${activeDropdownFilterCount})` : ""}
                </Button>
                {canManage && glossary?.source === "native" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={importConcepts.isPending || exportGlossary.isPending}
                    onClick={() => store.setImportDialogOpen(true)}
                  >
                    {importConcepts.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <UploadSimpleIcon data-icon="inline-start" />
                    )}
                    <FormattedMessage {...messages.importGlossary} />
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={exportGlossary.isPending || importConcepts.isPending}
                    onClick={() => store.openExportDialog()}
                  >
                    {exportGlossary.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <DownloadSimpleIcon data-icon="inline-start" />
                    )}
                    <FormattedMessage {...messages.exportGlossary} />
                  </Button>
                ) : null}
                {canContribute ? (
                  <Button type="button" onClick={() => router.push(`${glossaryHref}/concepts/new`)}>
                    <PlusIcon data-icon="inline-start" />
                    <FormattedMessage {...messages.addConcept} />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-52 flex-1 sm:max-w-sm">
                <label htmlFor="glossary-concept-search" className="sr-only">
                  {intl.formatMessage(messages.searchConceptsLabel)}
                </label>
                <input
                  id="glossary-concept-search"
                  type="search"
                  value={store.conceptSearch}
                  onChange={(event) => store.setConceptSearch(event.currentTarget.value)}
                  placeholder={intl.formatMessage(messages.searchConceptsPlaceholder)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {conceptsRefreshing ? (
                <span
                  role="status"
                  aria-label={intl.formatMessage(messages.refreshingConcepts)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Spinner className="size-3.5" />
                  <FormattedMessage {...messages.refreshingConcepts} />
                </span>
              ) : null}
              {conceptsQuery.data && !conceptsRefreshing ? (
                <TypographyP size="xsmall" tone="subtle" aria-live="polite">
                  {intl.formatMessage(messages.resultsCount, {
                    count: conceptsQuery.data.total,
                  })}
                </TypographyP>
              ) : null}
              {activeFilterCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => store.clearAllConceptFilters()}
                >
                  <FormattedMessage {...messages.clearFilters} />
                </Button>
              ) : null}
            </div>
            <Dialog
              open={store.filterDialogOpen}
              onOpenChange={(open) => store.setFilterDialogOpen(open)}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    <FormattedMessage {...messages.filtersTitle} />
                  </DialogTitle>
                  <DialogDescription>
                    <FormattedMessage {...messages.filtersDescription} />
                  </DialogDescription>
                </DialogHeader>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <EnumFilterSelect
                    id="glossary-filter-locale"
                    label={intl.formatMessage(messages.filterLanguagesLabel)}
                    value={store.filterDraft.locale || "all"}
                    displayValue={
                      store.filterDraft.locale || intl.formatMessage(messages.filterAllValue)
                    }
                    onValueChange={(value) => store.updateFilterDraft("locale", value ?? "all")}
                  >
                    <SelectItem value="all" label={intl.formatMessage(messages.filterAllValue)}>
                      {intl.formatMessage(messages.filterAllValue)}
                    </SelectItem>
                    {glossary.languages.map((language) => (
                      <SelectItem
                        key={language.locale}
                        value={language.locale}
                        label={language.name}
                      >
                        {language.name}
                      </SelectItem>
                    ))}
                  </EnumFilterSelect>
                  <EnumFilterSelect
                    id="glossary-filter-modified"
                    label={intl.formatMessage(messages.filterLastModifiedLabel)}
                    value={store.filterDraft.modified || "all"}
                    displayValue={
                      store.filterDraft.modified === "24h"
                        ? intl.formatMessage(messages.lastModified24h)
                        : store.filterDraft.modified === "7d"
                          ? intl.formatMessage(messages.lastModified7d)
                          : store.filterDraft.modified === "30d"
                            ? intl.formatMessage(messages.lastModified30d)
                            : intl.formatMessage(messages.filterAllValue)
                    }
                    onValueChange={(value) => store.updateFilterDraft("modified", value ?? "all")}
                  >
                    <SelectItem value="all" label={intl.formatMessage(messages.filterAllValue)}>
                      {intl.formatMessage(messages.filterAllValue)}
                    </SelectItem>
                    <SelectItem value="24h" label={intl.formatMessage(messages.lastModified24h)}>
                      {intl.formatMessage(messages.lastModified24h)}
                    </SelectItem>
                    <SelectItem value="7d" label={intl.formatMessage(messages.lastModified7d)}>
                      {intl.formatMessage(messages.lastModified7d)}
                    </SelectItem>
                    <SelectItem value="30d" label={intl.formatMessage(messages.lastModified30d)}>
                      {intl.formatMessage(messages.lastModified30d)}
                    </SelectItem>
                  </EnumFilterSelect>
                  <EnumFilterSelect
                    id="glossary-filter-pos"
                    label={intl.formatMessage(messages.filterPartOfSpeechLabel)}
                    value={store.filterDraft.partOfSpeech || "all"}
                    displayValue={
                      store.filterDraft.partOfSpeech
                        ? readableEnumLabel(store.filterDraft.partOfSpeech)
                        : intl.formatMessage(messages.filterAllValue)
                    }
                    onValueChange={(value) =>
                      store.updateFilterDraft("partOfSpeech", value ?? "all")
                    }
                  >
                    <SelectItem value="all" label={intl.formatMessage(messages.filterAllValue)}>
                      {intl.formatMessage(messages.filterAllValue)}
                    </SelectItem>
                    {glossaryPartOfSpeechValues.map((value) => (
                      <SelectItem key={value} value={value} label={readableEnumLabel(value)}>
                        <PartOfSpeechDisplay value={value} />
                      </SelectItem>
                    ))}
                  </EnumFilterSelect>
                  <EnumFilterSelect
                    id="glossary-filter-term-type"
                    label={intl.formatMessage(messages.filterTypeLabel)}
                    value={store.filterDraft.termType || "all"}
                    displayValue={
                      store.filterDraft.termType
                        ? readableEnumLabel(store.filterDraft.termType)
                        : intl.formatMessage(messages.filterAllValue)
                    }
                    onValueChange={(value) => store.updateFilterDraft("termType", value ?? "all")}
                  >
                    <SelectItem value="all" label={intl.formatMessage(messages.filterAllValue)}>
                      {intl.formatMessage(messages.filterAllValue)}
                    </SelectItem>
                    {glossaryTermTypeValues.map((value) => (
                      <SelectItem key={value} value={value} label={readableEnumLabel(value)}>
                        <TermTypeDisplay value={value} />
                      </SelectItem>
                    ))}
                  </EnumFilterSelect>
                  <EnumFilterSelect
                    id="glossary-filter-term-status"
                    label={intl.formatMessage(messages.filterStatusLabel)}
                    value={store.filterDraft.linguisticStatus || "all"}
                    displayValue={
                      store.filterDraft.linguisticStatus
                        ? readableEnumLabel(store.filterDraft.linguisticStatus)
                        : intl.formatMessage(messages.filterAllValue)
                    }
                    onValueChange={(value) =>
                      store.updateFilterDraft("linguisticStatus", value ?? "all")
                    }
                  >
                    <SelectItem value="all" label={intl.formatMessage(messages.filterAllValue)}>
                      {intl.formatMessage(messages.filterAllValue)}
                    </SelectItem>
                    {glossaryTermStatusValues.map((value) => (
                      <SelectItem key={value} value={value} label={readableEnumLabel(value)}>
                        <StatusLabel status={value} />
                      </SelectItem>
                    ))}
                  </EnumFilterSelect>
                  <EnumFilterSelect
                    id="glossary-filter-gender"
                    label={intl.formatMessage(messages.filterGenderLabel)}
                    value={store.filterDraft.gender || "all"}
                    displayValue={
                      store.filterDraft.gender
                        ? readableEnumLabel(store.filterDraft.gender)
                        : intl.formatMessage(messages.filterAllValue)
                    }
                    onValueChange={(value) => store.updateFilterDraft("gender", value ?? "all")}
                  >
                    <SelectItem value="all" label={intl.formatMessage(messages.filterAllValue)}>
                      {intl.formatMessage(messages.filterAllValue)}
                    </SelectItem>
                    {glossaryGenderValues.map((value) => (
                      <SelectItem key={value} value={value} label={readableEnumLabel(value)}>
                        <GenderDisplay value={value} />
                      </SelectItem>
                    ))}
                  </EnumFilterSelect>
                  <EnumFilterSelect
                    id="glossary-filter-author"
                    label={intl.formatMessage(messages.filterAuthorLabel)}
                    value={store.filterDraft.author || "all"}
                    displayValue={
                      authorOptions.find((member) => member.userId === store.filterDraft.author)
                        ?.displayName ||
                      store.filterDraft.author ||
                      intl.formatMessage(messages.filterAllValue)
                    }
                    onValueChange={(value) => store.updateFilterDraft("author", value ?? "all")}
                  >
                    <SelectItem value="all" label={intl.formatMessage(messages.filterAllValue)}>
                      {intl.formatMessage(messages.filterAllValue)}
                    </SelectItem>
                    {[
                      ...authorOptions,
                      ...(store.filterDraft.author &&
                      !authorOptions.some((member) => member.userId === store.filterDraft.author)
                        ? [
                            {
                              userId: store.filterDraft.author,
                              displayName: store.filterDraft.author,
                            },
                          ]
                        : []),
                    ].map((author) => (
                      <SelectItem
                        key={author.userId}
                        value={author.userId}
                        label={author.displayName}
                      >
                        {author.displayName}
                      </SelectItem>
                    ))}
                  </EnumFilterSelect>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={store.filterDraftIsEmpty}
                    onClick={() => store.clearFilterDraft()}
                  >
                    <FormattedMessage {...messages.clearFilters} />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => store.setFilterDialogOpen(false)}
                  >
                    <FormattedMessage {...messages.filtersCancel} />
                  </Button>
                  <Button type="button" onClick={() => store.applyConceptFilters()}>
                    <FormattedMessage {...messages.filtersApply} />
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {conceptsQuery.isError ? (
            <TypographyP size="small" tone="critical">
              {conceptsQuery.error.message}
            </TypographyP>
          ) : null}
          <div
            className={cn(
              "overflow-x-auto rounded-lg border border-border transition-opacity",
              conceptsRefreshing && "pointer-events-none opacity-60",
            )}
            aria-busy={conceptsRefreshing || undefined}
          >
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      aria-label="Select all concepts"
                      checked={store.conceptSelectionState(concepts.map((concept) => concept.id))}
                      onCheckedChange={(checked) =>
                        checked
                          ? store.selectAllConcepts(concepts.map((concept) => concept.id))
                          : store.clearConceptSelection()
                      }
                    />
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium"
                      onClick={() => store.toggleConceptSort()}
                    >
                      {sourceLanguage.name} {store.conceptSort === "asc" ? "↑" : "↓"}
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <FormattedMessage {...messages.definitionLabel} />
                  </th>
                  <th className="px-3 py-2">
                    <FormattedMessage {...messages.subjectLabel} />
                  </th>
                  <th className="px-3 py-2">
                    <FormattedMessage {...messages.created} />
                  </th>
                  <th className="px-3 py-2">
                    <FormattedMessage {...messages.lastModified} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {concepts.map((concept) => (
                  <tr
                    key={concept.id}
                    className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/20"
                    onClick={() => router.push(store.conceptHref(concept.id))}
                  >
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${concept.primaryTerm}`}
                        checked={store.selectedConceptIds.has(concept.id)}
                        onCheckedChange={(checked) =>
                          store.setConceptSelected(concept.id, Boolean(checked))
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {concept.primaryTerm}
                      </div>
                    </td>
                    <td className="max-w-xs truncate px-3 py-3 text-muted-foreground">
                      {concept.definition || "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{concept.subject || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                      {formatDate(concept.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                      {formatDate(concept.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {conceptsQuery.isSuccess && concepts.length === 0 ? (
              <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
                <TypographyP size="small" tone="subtle">
                  <FormattedMessage {...messages.noConcepts} />
                </TypographyP>
                {canContribute || canManage ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {canContribute ? (
                      <Button
                        type="button"
                        onClick={() => router.push(`${glossaryHref}/concepts/new`)}
                      >
                        <PlusIcon data-icon="inline-start" />
                        <FormattedMessage {...messages.addConcept} />
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => store.setImportDialogOpen(true)}
                      >
                        <UploadSimpleIcon data-icon="inline-start" />
                        <FormattedMessage {...messages.importGlossary} />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {conceptsQuery.isSuccess &&
          (conceptsQuery.data?.pagination.hasMore || store.conceptCursor) ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!store.conceptCursor || conceptsQuery.isFetching}
                onClick={goToPreviousConceptPage}
              >
                <FormattedMessage {...messages.previousPage} />
              </Button>
              <TypographyP size="xsmall" tone="subtle">
                {conceptsQuery.data.pagination.returned} of {conceptsQuery.data.total}
              </TypographyP>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!conceptsQuery.data.nextCursor || conceptsQuery.isFetching}
                onClick={goToNextConceptPage}
              >
                <FormattedMessage {...messages.nextPage} />
              </Button>
            </div>
          ) : null}
        </section>
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div>
            <TypographyP size="small" weight="medium" tone="content">
              <FormattedMessage {...messages.assignedProjectsTitle} />
            </TypographyP>
            <TypographyP size="xsmall" tone="subtle">
              <FormattedMessage {...messages.assignedProjectsDescription} />
            </TypographyP>
          </div>
          {canManage ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={store.selectedProjectId || null}
                onValueChange={(value) => store.setSelectedProjectId(value ?? "")}
              >
                <SelectTrigger className="sm:max-w-sm">
                  <SelectValue>
                    {store.selectedProjectId
                      ? (availableProjects.find((project) => project.id === store.selectedProjectId)
                          ?.name ?? store.selectedProjectId)
                      : intl.formatMessage(messages.selectProjectPlaceholder)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableProjects
                    .filter((project) => project.sourceLocale === glossary.sourceLocale)
                    .map((project) => (
                      <SelectItem key={project.id} value={project.id} label={project.name}>
                        {project.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!store.selectedProjectId || attachProject.isPending}
                onClick={() => attachProject.mutate(store.selectedProjectId)}
              >
                <FormattedMessage {...messages.assignToProject} />
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2">
            {(attachedProjectsQuery.data ?? []).map((project) => (
              <div
                key={project.projectId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                {project.externalUrl ? (
                  <a
                    href={project.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {project.projectName}
                  </a>
                ) : (
                  <Link
                    href={`/org/${organizationSlug}/projects/${project.projectId}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {project.projectName}
                  </Link>
                )}
                {canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => detachProject.mutate(project.projectId)}
                  >
                    <FormattedMessage {...messages.removeProject} />
                  </Button>
                ) : null}
              </div>
            ))}
            {attachedProjectsQuery.isSuccess && (attachedProjectsQuery.data ?? []).length === 0 ? (
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.noProjectsAssigned} />
              </TypographyP>
            ) : null}
          </div>
        </section>
      </>

      <Dialog
        open={canManage && store.exportDialogOpen}
        onOpenChange={(open) => {
          if (exportGlossary.isPending) return;
          store.setExportDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.exportGlossaryTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.exportGlossaryDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-foreground">
                <FormattedMessage {...messages.exportFormatLabel} />
              </legend>
              <div className="flex flex-wrap gap-2">
                {(["tbx", "csv", "xlsx"] as const).map((format) => (
                  <Button
                    key={format}
                    type="button"
                    variant={store.exportFormat === format ? "default" : "outline"}
                    size="sm"
                    onClick={() => store.setExportFormat(format)}
                  >
                    {format.toUpperCase()}
                  </Button>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-foreground">
                <FormattedMessage {...messages.exportScopeLabel} />
              </legend>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={store.exportScope === "complete" ? "default" : "outline"}
                  size="sm"
                  onClick={() => store.setExportScope("complete")}
                >
                  <FormattedMessage {...messages.exportScopeComplete} />
                </Button>
                <Button
                  type="button"
                  variant={store.exportScope === "filtered" ? "default" : "outline"}
                  size="sm"
                  disabled={!canExportFiltered}
                  onClick={() => store.setExportScope("filtered")}
                >
                  <FormattedMessage {...messages.exportScopeFiltered} />
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </Button>
              </div>
              {canExportFiltered ? (
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage {...messages.exportFilteredSummary} />
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage {...messages.exportFilteredHint} />
                </p>
              )}
            </fieldset>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={exportGlossary.isPending}
              onClick={() => store.setExportDialogOpen(false)}
            >
              <FormattedMessage {...messages.cancelEdit} />
            </Button>
            <Button
              type="button"
              disabled={
                exportGlossary.isPending || (store.exportScope === "filtered" && !canExportFiltered)
              }
              onClick={() => {
                if (store.exportScope === "complete") {
                  exportGlossary.mutate(store.buildCompleteExportInput());
                } else {
                  exportGlossary.mutate(store.buildFilteredExportInput());
                }
              }}
            >
              {exportGlossary.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadSimpleIcon data-icon="inline-start" />
              )}
              <FormattedMessage {...messages.exportStart} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={canManage && store.importDialogOpen}
        onOpenChange={(open) => {
          if (importConcepts.isPending) return;
          store.setImportDialogOpen(open);
          if (!open && glossaryFileInputRef.current) glossaryFileInputRef.current.value = "";
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.importGlossary} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.importGlossaryDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <input
              ref={glossaryFileInputRef}
              id="glossary-file-import"
              type="file"
              accept=".csv,.tbx,.xlsx,text/csv,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label={intl.formatMessage(messages.selectGlossaryFile)}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                store.setImportFile(file);
                importConcepts.mutate(file);
              }}
            />
            <label
              htmlFor="glossary-file-import"
              className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-8 text-center transition-colors hover:bg-muted/40 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
              aria-busy={importConcepts.isPending}
            >
              {importConcepts.isPending ? (
                <Spinner className="size-5" />
              ) : (
                <UploadSimpleIcon className="size-5" />
              )}
              <span className="text-sm font-medium text-foreground">
                {store.importFile?.name ?? <FormattedMessage {...messages.selectGlossaryFile} />}
              </span>
              <span className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.importFormats} />
              </span>
            </label>
            {importConcepts.isPending ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                <FormattedMessage {...messages.importingGlossary} />
              </p>
            ) : null}
            {importConcepts.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {importConcepts.error instanceof Error
                  ? importConcepts.error.message
                  : intl.formatMessage(messages.importTermsFailed)}
              </p>
            ) : null}
            {store.importDiagnostics.length > 0 ? (
              <div className="grid gap-1.5" role="alert" aria-live="polite">
                <p className="text-sm font-medium text-destructive">
                  <FormattedMessage {...messages.termsImportBlockedTitle} />
                </p>
                <ul className="grid list-disc gap-1 pl-5 text-xs text-muted-foreground">
                  {store.importDiagnostics.map((entry, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={`${entry.code}-${index}`}>
                      {entry.message} <span className="font-mono">({entry.code})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={importConcepts.isPending}
              onClick={() => store.setImportDialogOpen(false)}
            >
              <FormattedMessage {...messages.cancelEdit} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={store.deleteGlossaryDialogOpen}
        onOpenChange={(open) => {
          if (!deleteGlossary.isPending) {
            store.setDeleteGlossaryDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.confirmDeleteGlossaryTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage(messages.confirmDeleteGlossaryDescription, {
                glossaryName: glossary.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteGlossary.isPending}>
              <FormattedMessage {...messages.cancelEdit} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteGlossary.isPending}
              onClick={() => deleteGlossary.mutate()}
            >
              {deleteGlossary.isPending ? <Spinner /> : <TrashIcon />}
              <FormattedMessage {...messages.deleteGlossary} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
});
