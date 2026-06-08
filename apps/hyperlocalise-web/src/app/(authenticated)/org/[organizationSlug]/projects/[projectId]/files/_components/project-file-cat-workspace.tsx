"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircleIcon, CheckIcon, SaveIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ProjectFileCatResponse,
  ProjectFileCatSegment,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

type CatFile = ProjectFileCatResponse["catFile"];
type SaveState = "unchanged" | "dirty" | "saving" | "saved" | "failed";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function projectFileCatQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
  targetLocale: string,
) {
  return ["project-file-cat", organizationSlug, projectId, sourcePath, targetLocale] as const;
}

function initialTargetLocale(targetLocales: string[], highlightLocale: string | null) {
  if (highlightLocale && targetLocales.includes(highlightLocale)) {
    return highlightLocale;
  }

  return targetLocales[0] ?? "";
}

function draftValuesFor(catFile: CatFile | null) {
  return Object.fromEntries(
    (catFile?.segments ?? []).map((segment) => [
      segment.externalStringId,
      segment.target?.text ?? "",
    ]),
  );
}

function saveStatesFor(catFile: CatFile | null) {
  return Object.fromEntries(
    (catFile?.segments ?? []).map((segment) => [segment.externalStringId, "unchanged" as const]),
  );
}

export function mergeCatWorkspaceRows(
  catFile: CatFile | null,
  current: {
    drafts: Record<string, string>;
    saveStates: Record<string, SaveState>;
    rowErrors: Record<string, string>;
  },
) {
  const drafts: Record<string, string> = {};
  const saveStates: Record<string, SaveState> = {};
  const rowErrors: Record<string, string> = {};

  for (const segment of catFile?.segments ?? []) {
    const id = segment.externalStringId;
    const state = current.saveStates[id] ?? "unchanged";

    if (state === "dirty" || state === "saving") {
      drafts[id] = current.drafts[id] ?? "";
      saveStates[id] = state;
      if (current.rowErrors[id]) {
        rowErrors[id] = current.rowErrors[id];
      }
      continue;
    }

    drafts[id] = segment.target?.text ?? "";
    saveStates[id] = "unchanged";
  }

  return { drafts, saveStates, rowErrors };
}

export function ProjectFileCatWorkspace({
  organizationSlug,
  projectId,
  sourcePath,
  targetLocales,
  highlightLocale,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
  highlightLocale: string | null;
}) {
  const [targetLocale, setTargetLocale] = useState(() =>
    initialTargetLocale(targetLocales, highlightLocale),
  );
  const queryClient = useQueryClient();

  useEffect(() => {
    setTargetLocale((current) => {
      if (current && targetLocales.includes(current)) {
        return current;
      }

      return initialTargetLocale(targetLocales, highlightLocale);
    });
  }, [highlightLocale, targetLocales]);

  const queryKey = projectFileCatQueryKey(organizationSlug, projectId, sourcePath, targetLocale);
  const catQuery = useQuery({
    queryKey,
    enabled: Boolean(targetLocale),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.$get({
        param: { organizationSlug, projectId },
        query: { sourcePath, targetLocale },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to load CAT workspace"));
      }

      const body = (await response.json()) as ProjectFileCatResponse;
      return body.catFile;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: { externalStringId: string; text: string }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.translations.$post({
        param: { organizationSlug, projectId },
        json: {
          sourcePath,
          targetLocale,
          externalStringId: input.externalStringId,
          text: input.text,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to save translation"));
      }

      const body = (await response.json()) as { translation: ProjectFileCatTranslation };
      return { externalStringId: input.externalStringId, translation: body.translation };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  if (targetLocales.length === 0) {
    return (
      <TypographyP className="text-sm text-muted-foreground">
        No target locales are available for this provider file.
      </TypographyP>
    );
  }

  return (
    <ProjectFileCatWorkspaceView
      catFile={catQuery.data ?? null}
      targetLocales={targetLocales}
      targetLocale={targetLocale}
      onTargetLocaleChange={setTargetLocale}
      isLoading={catQuery.isLoading}
      error={catQuery.isError ? catQuery.error : undefined}
      onSave={async (externalStringId, text) => {
        const result = await saveMutation.mutateAsync({ externalStringId, text });
        return result.translation;
      }}
    />
  );
}

export function ProjectFileCatWorkspaceView({
  catFile,
  targetLocales,
  targetLocale,
  onTargetLocaleChange,
  isLoading,
  error,
  onSave,
}: {
  catFile: CatFile | null;
  targetLocales: string[];
  targetLocale: string;
  onTargetLocaleChange: (locale: string) => void;
  isLoading: boolean;
  error?: unknown;
  onSave?: (externalStringId: string, text: string) => Promise<ProjectFileCatTranslation>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => draftValuesFor(catFile));
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>(() =>
    saveStatesFor(catFile),
  );
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const merged = mergeCatWorkspaceRows(catFile, { drafts, saveStates, rowErrors });
    setDrafts(merged.drafts);
    setSaveStates(merged.saveStates);
    setRowErrors(merged.rowErrors);
  }, [catFile]);

  const segments = catFile?.segments ?? [];
  const counts = useMemo(() => {
    const translated = segments.filter((segment) => segment.target?.text.trim()).length;
    const approved = segments.filter((segment) => segment.target?.isApproved).length;
    const withComments = segments.filter((segment) => segment.comments.length > 0).length;
    return { translated, approved, withComments };
  }, [segments]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-full text-[10px]">
            CAT
          </Badge>
          {catFile ? (
            <>
              <TypographyP className="text-xs text-muted-foreground">
                {segments.length} segment{segments.length === 1 ? "" : "s"}
                {catFile.truncated ? " (truncated)" : ""}
              </TypographyP>
              <TypographyP className="text-xs text-muted-foreground">
                {counts.translated} translated · {counts.approved} approved · {counts.withComments}{" "}
                with comments
              </TypographyP>
            </>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:max-w-44">
          <TypographyP className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Target locale
          </TypographyP>
          <Select
            value={targetLocale}
            onValueChange={(value) => {
              if (value) {
                onTargetLocaleChange(value);
              }
            }}
          >
            <SelectTrigger className="h-9 w-full font-mono text-xs">
              <SelectValue placeholder="Select locale" />
            </SelectTrigger>
            <SelectContent>
              {targetLocales.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {locale}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-8">
          <Spinner />
          <TypographyP className="text-sm text-muted-foreground">
            Loading CAT workspace…
          </TypographyP>
        </div>
      ) : error ? (
        <div className="flex min-h-40 items-center gap-2 rounded-md border border-border bg-background px-4 py-8 text-flame-100">
          <AlertCircleIcon className="size-4" />
          <TypographyP className="text-sm">
            {error instanceof Error ? error.message : "Failed to load CAT workspace."}
          </TypographyP>
        </div>
      ) : segments.length === 0 ? (
        <TypographyP className="text-sm text-muted-foreground">
          No source strings are available for this file.
        </TypographyP>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="max-h-[min(38rem,62vh)] overflow-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
                <tr>
                  <th className="w-52 px-3 py-2 font-medium text-muted-foreground">Key</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Source</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Target</th>
                  <th className="w-36 px-3 py-2 font-medium text-muted-foreground">State</th>
                  <th className="w-28 px-3 py-2 font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {segments.map((segment) => {
                  const draft = drafts[segment.externalStringId] ?? "";
                  const original = segment.target?.text ?? "";
                  const state = saveStates[segment.externalStringId] ?? "unchanged";
                  const dirty = draft !== original || state === "dirty";
                  const saving = state === "saving";
                  const disabled = !catFile?.canEditTranslations || saving || !onSave;

                  return (
                    <CatSegmentRow
                      key={segment.externalStringId}
                      segment={segment}
                      draft={draft}
                      saveState={dirty && state === "unchanged" ? "dirty" : state}
                      rowError={rowErrors[segment.externalStringId]}
                      disabled={disabled}
                      onDraftChange={(text) => {
                        setDrafts((current) => ({
                          ...current,
                          [segment.externalStringId]: text,
                        }));
                        setSaveStates((current) => ({
                          ...current,
                          [segment.externalStringId]: text === original ? "unchanged" : "dirty",
                        }));
                        setRowErrors((current) => {
                          const next = { ...current };
                          delete next[segment.externalStringId];
                          return next;
                        });
                      }}
                      onSave={async () => {
                        if (!onSave || !catFile?.canEditTranslations || !dirty) {
                          return;
                        }

                        setSaveStates((current) => ({
                          ...current,
                          [segment.externalStringId]: "saving",
                        }));
                        try {
                          await onSave(segment.externalStringId, draft);
                          setSaveStates((current) => ({
                            ...current,
                            [segment.externalStringId]: "saved",
                          }));
                        } catch (saveError) {
                          setSaveStates((current) => ({
                            ...current,
                            [segment.externalStringId]: "failed",
                          }));
                          setRowErrors((current) => ({
                            ...current,
                            [segment.externalStringId]:
                              saveError instanceof Error
                                ? saveError.message
                                : "Failed to save translation.",
                          }));
                        }
                      }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {catFile && !catFile.canEditTranslations ? (
        <TypographyP className="text-xs text-muted-foreground">
          You can view this CAT workspace, but your role cannot write translations back.
        </TypographyP>
      ) : null}
    </div>
  );
}

function CatSegmentRow({
  segment,
  draft,
  saveState,
  rowError,
  disabled,
  onDraftChange,
  onSave,
}: {
  segment: ProjectFileCatSegment;
  draft: string;
  saveState: SaveState;
  rowError?: string;
  disabled: boolean;
  onDraftChange: (text: string) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <tr className="align-top">
      <td className="px-3 py-3">
        <div className="space-y-2">
          <TypographyP className="font-mono text-xs text-foreground">{segment.key}</TypographyP>
          {segment.context?.trim() ? (
            <TypographyP className="text-xs text-muted-foreground">{segment.context}</TypographyP>
          ) : null}
          {segment.comments.length > 0 ? (
            <div className="space-y-1">
              {segment.comments.slice(0, 2).map((comment) => (
                <div
                  key={comment.externalCommentId}
                  className={cn(
                    "rounded border px-2 py-1 text-[11px]",
                    comment.type === "issue"
                      ? "border-flame-100/25 bg-flame-100/5 text-flame-100"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  <span className="font-medium">
                    {comment.type === "issue" ? "Issue" : "Comment"}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {DATE_FORMATTER.format(new Date(comment.createdAt))}
                  </span>
                  <div className="mt-1 whitespace-pre-wrap">{comment.text}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </td>
      <td className="max-w-[18rem] px-3 py-3 whitespace-pre-wrap text-foreground/78">
        {segment.sourceText}
      </td>
      <td className="px-3 py-3">
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          disabled={disabled}
          className="min-h-24 rounded-md font-mono text-xs"
          placeholder="Add translation"
        />
        {rowError ? (
          <TypographyP className="mt-1 text-xs text-flame-100">{rowError}</TypographyP>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1.5">
          <Badge variant="outline" className="w-fit rounded-full text-[10px]">
            {segment.target?.isApproved ? "Approved" : segment.target?.text ? "Translated" : "Open"}
          </Badge>
          <SaveStateBadge state={saveState} />
        </div>
      </td>
      <td className="px-3 py-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || saveState === "unchanged" || saveState === "saved"}
          onClick={() => void onSave()}
        >
          {saveState === "saving" ? (
            <Spinner className="size-3" />
          ) : saveState === "saved" ? (
            <CheckIcon className="size-3" />
          ) : (
            <SaveIcon className="size-3" />
          )}
          Save
        </Button>
      </td>
    </tr>
  );
}

function SaveStateBadge({ state }: { state: SaveState }) {
  if (state === "unchanged") {
    return <span className="text-xs text-muted-foreground">Unchanged</span>;
  }

  if (state === "dirty") {
    return <span className="text-xs text-foreground">Unsaved</span>;
  }

  if (state === "saving") {
    return <span className="text-xs text-muted-foreground">Saving…</span>;
  }

  if (state === "saved") {
    return <span className="text-xs text-emerald-600">Saved</span>;
  }

  return <span className="text-xs text-flame-100">Failed</span>;
}
