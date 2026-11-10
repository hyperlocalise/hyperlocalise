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
import { useRouter } from "next/navigation";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

import { useGuidelineDocumentUpload } from "../../_components/guideline-documents-section";
import { GuidelineTextDocumentDialog } from "../../_components/guideline-text-document-dialog";
import { KnowledgeUploadSection } from "../../_components/knowledge-upload-section";
import { guidelineUploadMessages as messages } from "./guideline-upload.messages";

export function GuidelineUploadContent({
  organizationSlug,
  projectId,
  backHref,
}: {
  organizationSlug: string;
  projectId?: string;
  backHref: string;
}) {
  const router = useRouter();
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const uploadDocument = useGuidelineDocumentUpload(organizationSlug, projectId);

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
          if (file) {
            uploadDocument.mutate(file, {
              onSuccess: () => {
                router.push(backHref);
              },
            });
          }
        }}
      />

      <GuidelineTextDocumentDialog
        open={textDialogOpen}
        onOpenChange={setTextDialogOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        onSaved={() => {
          router.push(backHref);
        }}
      />
    </div>
  );
}
