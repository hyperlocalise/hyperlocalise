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
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { ProjectTargetLocalesPicker } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/_components/project-locale-picker";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import {
  guidelineDocumentsQueryKey,
  useGuidelineDocumentUpload,
} from "../../_components/guideline-documents-section";
import { GuidelineTextDocumentDialog } from "../../_components/guideline-text-document-dialog";
import { KnowledgeUploadSection } from "../../_components/knowledge-upload-section";
import { guidelineUploadMessages as messages } from "./guideline-upload.messages";
import { useQueryClient } from "@tanstack/react-query";

type ProjectScope = "none" | "all" | "selected";

export function GuidelineUploadContent({
  organizationSlug,
  projectId: deprecatedProjectId,
  initialProjectId,
  backHref,
}: {
  organizationSlug: string;
  /** @deprecated Project upload route is retired; use initialProjectId preselect. */
  projectId?: string;
  initialProjectId?: string;
  backHref: string;
}) {
  const router = useRouter();
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const preselected = initialProjectId ?? deprecatedProjectId ?? "";
  const [scope, setScope] = useState<ProjectScope>(preselected ? "selected" : "none");
  const [selectedIds, setSelectedIds] = useState<string[]>(preselected ? [preselected] : []);
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const uploadDocument = useGuidelineDocumentUpload(organizationSlug);

  const projectsQuery = useQuery({
    queryKey: ["guideline-upload-projects", organizationSlug],
    enabled: !loading,
    queryFn: async ({ signal }) => {
      const body = await client.project.list(organizationSlug, { signal });
      return [...body.projects].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const localeSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const project of projectsQuery.data ?? []) {
      for (const locale of project.targetLocales ?? []) set.add(locale);
      if (project.sourceLocale) set.add(project.sourceLocale);
    }
    return [...set].sort();
  }, [projectsQuery.data]);

  const locales = selectedLocales;
  const isGlobal = scope === "all";
  const projectIds = scope === "selected" ? selectedIds : [];

  const attachProjects = async (documentId: string) => {
    for (const pid of projectIds) {
      await client.guidelines.attachDocumentProject(organizationSlug, documentId, pid);
    }
    void queryClient.invalidateQueries({
      queryKey: guidelineDocumentsQueryKey(organizationSlug),
    });
    void queryClient.invalidateQueries({
      queryKey: ["guideline-document-assignments", organizationSlug],
    });
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id),
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <TypographyH1>
            <FormattedMessage {...messages.title} />
          </TypographyH1>
          <TypographyP tone="subtle">
            <FormattedMessage {...messages.description} />
          </TypographyP>
        </div>
        <Button
          type="button"
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href={backHref} />}
        >
          <FormattedMessage {...messages.backToGuideline} />
        </Button>
      </div>

      <KnowledgeUploadSection
        onStartMarkdownText={() => setTextDialogOpen(true)}
        onFilesSelected={(files) => {
          const [file] = files;
          if (!file) return;
          if (scope === "selected" && projectIds.length === 0) return;
          uploadDocument.mutate(
            { file, title: file.name, locales, isGlobal },
            {
              onSuccess: (document) => {
                void (async () => {
                  if (projectIds.length > 0) await attachProjects(document.id);
                  router.push(backHref);
                })();
              },
            },
          );
        }}
      />

      <div className="flex flex-col gap-2">
        <ProjectTargetLocalesPicker
          value={selectedLocales}
          onChange={setSelectedLocales}
          sourceLocale=""
          additionalLocales={localeSuggestions}
          labelMessage={messages.localesLabel}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3">
        <Field className="gap-1.5">
          <FieldLabel>
            <FormattedMessage {...messages.projectScopeLabel} />
          </FieldLabel>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={intl.formatMessage(messages.projectScopeLabel)}
          >
            {(
              [
                ["none", messages.projectScopeNone],
                ["all", messages.projectScopeAll],
                ["selected", messages.projectScopeSelected],
              ] as const
            ).map(([value, message]) => (
              <Button
                key={value}
                type="button"
                variant={scope === value ? "default" : "outline"}
                size="sm"
                onClick={() => setScope(value)}
              >
                <FormattedMessage {...message} />
              </Button>
            ))}
          </div>
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.projectScopeHint} />
          </TypographyP>
        </Field>

        {scope === "selected" ? (
          <div className="grid gap-2">
            {projectsQuery.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : (projectsQuery.data ?? []).length === 0 ? (
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.noProjects} />
              </TypographyP>
            ) : (
              (projectsQuery.data ?? []).map((project) => (
                <label key={project.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedIds.includes(project.id)}
                    onCheckedChange={(checked) => toggleSelected(project.id, checked === true)}
                  />
                  <span className="truncate">{project.name}</span>
                </label>
              ))
            )}
          </div>
        ) : null}
      </section>

      <GuidelineTextDocumentDialog
        open={textDialogOpen}
        onOpenChange={setTextDialogOpen}
        organizationSlug={organizationSlug}
        initialLocales={locales}
        initialIsGlobal={isGlobal}
        onSaved={(documentId) => {
          void (async () => {
            if (documentId && projectIds.length > 0) await attachProjects(documentId);
            router.push(backHref);
          })();
        }}
      />
    </div>
  );
}
