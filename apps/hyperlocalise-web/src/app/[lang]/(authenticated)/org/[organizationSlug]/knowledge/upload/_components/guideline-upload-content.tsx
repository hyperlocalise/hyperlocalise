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

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { observer } from "mobx-react-lite";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { useGuidelineDocumentUpload } from "../../_components/guideline-documents-section";
import { GuidelineTextDocumentDialog } from "../../_components/guideline-text-document-dialog";
import { KnowledgeUploadSection } from "../../_components/knowledge-upload-section";
import {
  GuidelineUploadPageStoreProvider,
  useGuidelineUploadPageStore,
} from "../store/guideline-upload-store-context";
import { GuidelineScopeToolbar } from "./guideline-scope-fields";
import { guidelineUploadMessages as messages } from "./guideline-upload.messages";

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
  return (
    <GuidelineUploadPageStoreProvider
      organizationSlug={organizationSlug}
      initialProjectId={initialProjectId ?? deprecatedProjectId}
    >
      <GuidelineUploadContentView backHref={backHref} />
    </GuidelineUploadPageStoreProvider>
  );
}

const GuidelineUploadContentView = observer(function GuidelineUploadContentView({
  backHref,
}: {
  backHref: string;
}) {
  const store = useGuidelineUploadPageStore();
  const { organizationSlug } = store;
  const router = useRouter();
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();
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

  const invalidateGuidelineLists = () => {
    void queryClient.invalidateQueries({
      queryKey: ["guideline-documents", organizationSlug],
    });
    void queryClient.invalidateQueries({
      queryKey: ["guideline-document-assignments", organizationSlug],
    });
  };

  const finishCreate = async (documentId: string | undefined) => {
    const projectIds = store.projectIdsToAttach;
    try {
      if (documentId) {
        for (const projectId of projectIds) {
          await client.guidelines.attachDocumentProject(organizationSlug, documentId, projectId);
        }
      }
      invalidateGuidelineLists();
      router.push(backHref);
    } catch (error) {
      invalidateGuidelineLists();
      toast.error(goSvcErrorMessage(error, intl.formatMessage(messages.assignFailed)));
    }
  };

  const uploadStagedFile = () => {
    const file = store.stagedFile;
    if (!file || !store.validateScope()) return;
    uploadDocument.mutate(
      { file, title: file.name, locales: store.locales, isGlobal: store.isGlobal },
      {
        onSuccess: (document) => {
          void finishCreate(document.id);
        },
      },
    );
  };

  const uploading = uploadDocument.isPending;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Button
          type="button"
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="-ms-2 w-fit text-muted-foreground"
          render={<Link href={backHref} />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          <FormattedMessage {...messages.backToGuideline} />
        </Button>
        <div className="flex flex-col gap-1">
          <TypographyH1 className="text-2xl md:text-3xl">
            <FormattedMessage {...messages.title} />
          </TypographyH1>
          <TypographyP tone="subtle">
            <FormattedMessage {...messages.description} />
          </TypographyP>
        </div>
      </header>

      <GuidelineScopeToolbar
        localeSuggestions={localeSuggestions}
        projects={projectsQuery.data ?? []}
        loadingProjects={projectsQuery.isPending}
      />

      <KnowledgeUploadSection
        showTitle={false}
        className="space-y-4"
        selectedFile={store.stagedFile}
        onStartMarkdownText={() => store.startMarkdownText()}
        onFilesSelected={(files) => store.stageFile(files[0] ?? null)}
      />

      <footer className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        {store.canUploadFile ? null : (
          <p className="me-auto text-xs text-muted-foreground">
            <FormattedMessage {...messages.chooseFileHint} />
          </p>
        )}
        <Button
          type="button"
          nativeButton={false}
          variant="outline"
          render={<Link href={backHref} />}
        >
          <FormattedMessage {...messages.cancel} />
        </Button>
        <Button
          type="button"
          disabled={!store.canUploadFile || uploading}
          onClick={uploadStagedFile}
        >
          {uploading ? <Spinner data-icon="inline-start" /> : null}
          <FormattedMessage {...messages.uploadFile} />
        </Button>
      </footer>

      <GuidelineTextDocumentDialog
        open={store.textDialogOpen}
        onOpenChange={(open) => store.setTextDialogOpen(open)}
        organizationSlug={organizationSlug}
        initialLocales={store.locales}
        initialIsGlobal={store.isGlobal}
        onSaved={(documentId) => {
          void finishCreate(documentId);
        }}
      />
    </div>
  );
});
