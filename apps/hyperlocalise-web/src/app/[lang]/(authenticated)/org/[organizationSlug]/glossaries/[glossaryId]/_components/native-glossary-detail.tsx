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
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Add01Icon,
  ArrowLeft01Icon,
  BookOpenTextIcon,
  Delete02Icon,
  MoreHorizontalIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { GlossaryProjectRecord, GlossaryRecord } from "@/api/routes/glossary/glossary.schema";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

import { glossaryDetailPageContentMessages as messages } from "./glossary-detail-page-content.messages";
import { useGlossary } from "./use-glossary";

function arrayBufferToBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

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
      <Skeleton className="h-4 w-24 rounded-full" />
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
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-20 max-w-full" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
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

export function NativeGlossaryDetail({
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
  const glossaryHref = `/org/${organizationSlug}/glossaries/${glossaryId}`;
  const conceptHref = (id: string) => `${glossaryHref}/concepts/${id}`;
  const [selectedConceptIds, setSelectedConceptIds] = useState<Set<string>>(new Set());
  const [conceptSort, setConceptSort] = useState<"asc" | "desc">("asc");
  const [conceptSearch, setConceptSearch] = useState("");
  const [conceptCursor, setConceptCursor] = useState<string | undefined>();
  const [, setConceptCursorStack] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const skipNameBlurSave = useRef(false);
  const glossaryFileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDiagnostics, setImportDiagnostics] = useState<
    Array<{ severity: string; code: string; message: string }>
  >([]);
  const [deleteGlossaryDialogOpen, setDeleteGlossaryDialogOpen] = useState(false);

  const { glossaryQuery, glossary, canManage, canContribute, sourceLanguage } = useGlossary({
    organizationSlug,
    glossaryId,
    canManageGlossaries,
  });

  useEffect(() => {
    if (glossary) setNameDraft(glossary.name);
  }, [glossary?.name]);

  const conceptsQuery = useQuery({
    queryKey: [
      "glossary-concepts-page",
      organizationSlug,
      glossaryId,
      conceptSearch,
      conceptCursor,
      conceptSort,
    ],
    enabled: true,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts.page.$get({
        param: { organizationSlug, glossaryId },
        query: {
          limit: "50",
          sort: "primary_term",
          sortDir: conceptSort,
          includeArchived: "false",
          ...(conceptSearch.trim() ? { search: conceptSearch.trim() } : {}),
          ...(conceptCursor ? { cursor: conceptCursor } : {}),
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
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects.$get({
        param: { organizationSlug, glossaryId },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadProjectsFailed)),
        );
      return (await response.json()).projects as GlossaryProjectRecord[];
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

  const concepts = conceptsQuery.data?.concepts ?? [];
  const attachedProjectIds = useMemo(
    () => new Set((attachedProjectsQuery.data ?? []).map((project) => project.projectId)),
    [attachedProjectsQuery.data],
  );
  const availableProjects = (projectsQuery.data ?? []).filter(
    (project) => !attachedProjectIds.has(project.id),
  );

  const allSelected =
    concepts.length > 0 && concepts.every((concept) => selectedConceptIds.has(concept.id));

  const invalidateConcepts = () =>
    queryClient.invalidateQueries({
      queryKey: ["glossary-concepts-page", organizationSlug, glossaryId],
    });

  const invalidateProjects = () =>
    queryClient.invalidateQueries({
      queryKey: ["glossary-projects", organizationSlug, glossaryId],
    });

  const importConcepts = useMutation({
    mutationFn: async (file: File) => {
      const filename = file.name.toLowerCase();
      const isXlsx = filename.endsWith(".xlsx");
      const format = filename.endsWith(".tbx") ? "tbx" : isXlsx ? "xlsx" : "csv";
      const content = isXlsx ? arrayBufferToBase64(await file.arrayBuffer()) : await file.text();
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts["import"].$post({
        param: { organizationSlug, glossaryId },
        json: {
          format,
          content,
          sourceFilename: file.name,
          contentEncoding: isXlsx ? "base64" : "utf8",
          mode: "merge",
          previewForMode: "merge",
          strictLocale: true,
          localeMapping: {},
        },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.importTermsFailed)),
        );
      return response.json();
    },
    onSuccess: async (body) => {
      await invalidateConcepts();
      // The import endpoint returns a union of preview and applied shapes;
      // this mutation always uses mode:"merge", so read the applied counters
      // defensively.
      const result = body as {
        imported?: number;
        updated?: number;
        merged?: number;
        diagnostics?: Array<{ severity: string; code: string; message: string }>;
      };
      const errorDiagnostics = (result.diagnostics ?? []).filter(
        (entry) => entry.severity === "error",
      );
      // A strict-locale import can legitimately apply zero new terms (for example
      // when every row targets an unconfigured locale). Keep the dialog open
      // and show why instead of a misleading "Imported 0 terms" success — but
      // only when nothing was applied at all, since merge/update imports
      // report applied work via `updated`/`merged` rather than `imported`.
      const applied = (result.imported ?? 0) + (result.updated ?? 0) + (result.merged ?? 0);
      if (applied === 0 && errorDiagnostics.length > 0) {
        setImportDiagnostics(errorDiagnostics.slice(0, 10));
        // Reset the native input so selecting the same (corrected) file still
        // fires a change event and retries the import.
        if (glossaryFileInputRef.current) glossaryFileInputRef.current.value = "";
        toast.error(
          intl.formatMessage(messages.termsImportBlocked, {
            count: errorDiagnostics.length,
          }),
        );
        return;
      }
      setImportDiagnostics([]);
      setImportDialogOpen(false);
      setImportFile(null);
      toast.success(intl.formatMessage(messages.termsImported, { count: result.imported ?? 0 }));
    },
    onError: (error) => toast.error(error.message),
  });

  const exportGlossary = useMutation({
    mutationFn: async (input: {
      format: "csv" | "tbx" | "xlsx";
      scope: "complete" | "filtered";
      locales?: string[];
    }) => {
      const params = new URLSearchParams({ format: input.format, scope: input.scope });
      if (input.scope === "filtered") {
        for (const locale of input.locales ?? []) params.append("locales", locale);
      }
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/glossaries/${encodeURIComponent(glossaryId)}/export?${params.toString()}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.exportFailed)));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = encodedFilename
        ? decodeURIComponent(encodedFilename)
        : `glossary.${input.format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return Number(response.headers.get("x-hyperlocalise-export-warning-count") ?? 0);
    },
    onSuccess: (warningCount) => {
      if (warningCount > 0) {
        toast.warning(intl.formatMessage(messages.exportWarnings, { count: warningCount }));
      } else {
        toast.success(intl.formatMessage(messages.exportComplete));
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const updateGlossaryName = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].$patch({
        param: { organizationSlug, glossaryId },
        json: { name },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.updateGlossaryNameFailed)),
        );
      return (await response.json()).glossary as GlossaryRecord;
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
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].$delete({
        param: { organizationSlug, glossaryId },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.deleteGlossaryFailed)),
        );
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["glossaries", organizationSlug] }),
        queryClient.invalidateQueries({ queryKey: ["native-glossaries", organizationSlug] }),
      ]);
      toast.success(intl.formatMessage(messages.glossaryDeleted));
      setDeleteGlossaryDialogOpen(false);
      router.push(`/org/${organizationSlug}/glossaries`);
    },
    onError: (error) => toast.error(error.message),
  });

  const saveGlossaryName = async () => {
    const name = nameDraft.trim();
    if (!name || !glossary || name === glossary.name) {
      setNameDraft(glossary?.name ?? nameDraft);
      return;
    }
    try {
      await updateGlossaryName.mutateAsync(name);
    } catch (error) {
      setNameDraft(glossary.name);
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(messages.updateGlossaryNameFailed),
      );
    }
  };

  const attachProject = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects.$post({
        param: { organizationSlug, glossaryId },
        json: { projectId, priority: 0 },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.assignProjectFailed)),
        );
    },
    onSuccess: async () => {
      await invalidateProjects();
      setSelectedProjectId("");
      toast.success(intl.formatMessage(messages.projectAssigned));
    },
    onError: (error) => toast.error(error.message),
  });

  const detachProject = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects[":projectId"].$delete({
        param: { organizationSlug, glossaryId, projectId },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.removeProjectFailed)),
        );
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

  const resetConceptCursor = (nextSearch = conceptSearch) => {
    setConceptCursorStack([]);
    setConceptCursor(undefined);
    if (nextSearch !== conceptSearch) setConceptSearch(nextSearch);
  };

  const goToNextConceptPage = () => {
    const nextCursor = conceptsQuery.data?.nextCursor;
    if (!nextCursor) return;
    setConceptCursorStack((current) => [...current, conceptCursor ?? ""]);
    setConceptCursor(nextCursor);
  };

  const goToPreviousConceptPage = () => {
    setConceptCursorStack((current) => {
      const next = [...current];
      setConceptCursor(next.pop() || undefined);
      return next;
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <Link
        href={`/org/${organizationSlug}/glossaries`}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        <FormattedMessage {...messages.backToList} />
      </Link>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={BookOpenTextIcon}
            className="size-5 text-muted-foreground"
            strokeWidth={1.8}
          />
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
              value={nameDraft}
              onChange={(event) => setNameDraft(event.currentTarget.value)}
              onBlur={() => {
                if (skipNameBlurSave.current) {
                  skipNameBlurSave.current = false;
                  return;
                }
                void saveGlossaryName();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  skipNameBlurSave.current = true;
                  setNameDraft(glossary.name);
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
        {canManage ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteGlossaryDialogOpen(true)}
              disabled={deleteGlossary.isPending}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} data-icon="inline-start" />
              <FormattedMessage {...messages.deleteGlossary} />
            </Button>
          </div>
        ) : null}
      </section>

      <>
        <section className="grid gap-4 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <TypographyP size="small" weight="medium" tone="content">
                <FormattedMessage {...messages.conceptsTitle} />
              </TypographyP>
              <TypographyP size="xsmall" tone="subtle">
                <FormattedMessage {...messages.conceptsDescription} />
              </TypographyP>
            </div>
            <Link href={`${glossaryHref}/history`} className="text-sm text-primary hover:underline">
              <FormattedMessage {...messages.glossaryHistory} />
            </Link>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-72">
              <label htmlFor="glossary-concept-search" className="sr-only">
                Search concepts
              </label>
              <input
                id="glossary-concept-search"
                type="search"
                value={conceptSearch}
                onChange={(event) => resetConceptCursor(event.currentTarget.value)}
                placeholder="Search concepts"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {canManage || canContribute ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canManage ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={exportGlossary.isPending || importConcepts.isPending}
                          aria-label={intl.formatMessage(messages.glossaryActions)}
                          title={intl.formatMessage(messages.glossaryActions)}
                        >
                          {exportGlossary.isPending || importConcepts.isPending ? (
                            <Spinner />
                          ) : (
                            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
                          )}
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>
                          <FormattedMessage {...messages.exportCompleteLabel} />
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          disabled={exportGlossary.isPending || importConcepts.isPending}
                          onClick={() =>
                            exportGlossary.mutate({ format: "tbx", scope: "complete" })
                          }
                        >
                          <FormattedMessage {...messages.exportAsTbx} />
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={exportGlossary.isPending || importConcepts.isPending}
                          onClick={() =>
                            exportGlossary.mutate({ format: "csv", scope: "complete" })
                          }
                        >
                          <FormattedMessage {...messages.exportAsCsv} />
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={exportGlossary.isPending || importConcepts.isPending}
                          onClick={() =>
                            exportGlossary.mutate({ format: "xlsx", scope: "complete" })
                          }
                        >
                          <FormattedMessage {...messages.exportAsXlsx} />
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      {canManage ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>
                              <FormattedMessage {...messages.importGlossary} />
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={exportGlossary.isPending || importConcepts.isPending}
                              onClick={() => setImportDialogOpen(true)}
                            >
                              <FormattedMessage {...messages.selectGlossaryFile} />
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {canContribute ? (
                  <Button type="button" onClick={() => router.push(`${glossaryHref}/concepts/new`)}>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                    <FormattedMessage {...messages.addConcept} />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {conceptsQuery.isError ? (
            <TypographyP size="small" tone="critical">
              {conceptsQuery.error.message}
            </TypographyP>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      aria-label="Select all concepts"
                      checked={
                        allSelected ? true : selectedConceptIds.size > 0 ? "indeterminate" : false
                      }
                      onCheckedChange={(checked) =>
                        setSelectedConceptIds(
                          checked ? new Set(concepts.map((concept) => concept.id)) : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium"
                      onClick={() => {
                        setConceptSort((sort) => (sort === "asc" ? "desc" : "asc"));
                        resetConceptCursor();
                      }}
                    >
                      {sourceLanguage.name} {conceptSort === "asc" ? "↑" : "↓"}
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
                    onClick={() => router.push(conceptHref(concept.id))}
                  >
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${concept.primaryTerm}`}
                        checked={selectedConceptIds.has(concept.id)}
                        onCheckedChange={(checked) =>
                          setSelectedConceptIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(concept.id);
                            else next.delete(concept.id);
                            return next;
                          })
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
                        <HugeiconsIcon
                          icon={Add01Icon}
                          strokeWidth={1.8}
                          data-icon="inline-start"
                        />
                        <FormattedMessage {...messages.addConcept} />
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setImportDialogOpen(true)}
                      >
                        <HugeiconsIcon
                          icon={Upload01Icon}
                          strokeWidth={1.8}
                          data-icon="inline-start"
                        />
                        <FormattedMessage {...messages.importGlossary} />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {conceptsQuery.isSuccess && (conceptsQuery.data?.pagination.hasMore || conceptCursor) ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!conceptCursor || conceptsQuery.isFetching}
                onClick={goToPreviousConceptPage}
              >
                Previous
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
                Next
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
                value={selectedProjectId || null}
                onValueChange={(value) => setSelectedProjectId(value ?? "")}
              >
                <SelectTrigger className="sm:max-w-sm">
                  <SelectValue>
                    {selectedProjectId
                      ? (availableProjects.find((project) => project.id === selectedProjectId)
                          ?.name ?? selectedProjectId)
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
                disabled={!selectedProjectId || attachProject.isPending}
                onClick={() => attachProject.mutate(selectedProjectId)}
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
        open={canManage && importDialogOpen}
        onOpenChange={(open) => {
          if (importConcepts.isPending) return;
          setImportDialogOpen(open);
          if (!open) {
            setImportFile(null);
            setImportDiagnostics([]);
            if (glossaryFileInputRef.current) glossaryFileInputRef.current.value = "";
          }
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
                setImportFile(file);
                setImportDiagnostics([]);
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
                <HugeiconsIcon icon={Upload01Icon} className="size-5" strokeWidth={1.8} />
              )}
              <span className="text-sm font-medium text-foreground">
                {importFile?.name ?? <FormattedMessage {...messages.selectGlossaryFile} />}
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
            {importDiagnostics.length > 0 ? (
              <div className="grid gap-1.5" role="alert" aria-live="polite">
                <p className="text-sm font-medium text-destructive">
                  <FormattedMessage {...messages.termsImportBlockedTitle} />
                </p>
                <ul className="grid list-disc gap-1 pl-5 text-xs text-muted-foreground">
                  {importDiagnostics.map((entry, index) => (
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
              onClick={() => setImportDialogOpen(false)}
            >
              <FormattedMessage {...messages.cancelEdit} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteGlossaryDialogOpen}
        onOpenChange={(open) => {
          if (!deleteGlossary.isPending) {
            setDeleteGlossaryDialogOpen(open);
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
              {deleteGlossary.isPending ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
              )}
              <FormattedMessage {...messages.deleteGlossary} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
