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
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Layers01Icon, TextFontIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { siGoogledrive, siNotion } from "simple-icons";
import { toast } from "sonner";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import {
  filterKnowledgeUploadFiles,
  KNOWLEDGE_UPLOAD_ACCEPT,
  KNOWLEDGE_UPLOAD_MAX_FILES,
  type KnowledgeUploadActionId,
} from "./knowledge-upload.shared";
import { knowledgeUploadSectionMessages } from "./knowledge-upload-section.messages";

function SharePointMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
    >
      <rect x="3" y="8" width="10" height="10" rx="1.5" fill="#038387" />
      <circle cx="16.5" cy="9.5" r="4.5" fill="#1A9BA1" />
      <circle cx="18.5" cy="15.5" r="3.5" fill="#37C6D0" />
    </svg>
  );
}

function UploadSourceButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" className="justify-start gap-2" onClick={onClick}>
      <span className="inline-flex size-4 shrink-0 items-center justify-center">{icon}</span>
      {label}
    </Button>
  );
}

export function KnowledgeUploadSection({
  onStartMarkdownText,
  onFilesSelected,
  className,
}: {
  onStartMarkdownText: () => void;
  onFilesSelected?: (files: File[]) => void;
  className?: string;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const applyFiles = (incoming: FileList | File[]) => {
    const all = Array.from(incoming);
    if (all.length > KNOWLEDGE_UPLOAD_MAX_FILES) {
      toast.message(intl.formatMessage(knowledgeUploadSectionMessages.tooManyFiles));
    }

    const accepted = filterKnowledgeUploadFiles(all);
    if (accepted.length === 0 && all.length > 0) {
      toast.message(intl.formatMessage(knowledgeUploadSectionMessages.unsupportedFiles));
      return;
    }

    setSelectedFiles(accepted);
    onFilesSelected?.(accepted);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      applyFiles(event.dataTransfer.files);
    }
  };

  const handleAction = (actionId: KnowledgeUploadActionId) => {
    switch (actionId) {
      case "google-drive":
      case "sharepoint":
      case "notion":
      case "import-website":
        toast.message(intl.formatMessage(knowledgeUploadSectionMessages.comingSoon));
        return;
      case "markdown-text":
        onStartMarkdownText();
        return;
    }
  };

  return (
    <section className={cn("space-y-5", className)}>
      <h2 className="text-base font-medium text-foreground">
        <FormattedMessage {...knowledgeUploadSectionMessages.title} />
      </h2>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background px-6 py-10 text-center transition-colors",
          isDragging && "border-foreground/40 bg-muted",
        )}
      >
        <HugeiconsIcon icon={Upload04Icon} strokeWidth={1.8} className="size-8 text-foreground" />
        <p className="text-sm text-foreground">
          <FormattedMessage
            {...knowledgeUploadSectionMessages.dropHint}
            values={{
              chooseFiles: (
                <span className="font-medium text-primary underline-offset-4 hover:underline">
                  <FormattedMessage {...knowledgeUploadSectionMessages.chooseFiles} />
                </span>
              ),
            }}
          />
        </p>
        <p className="max-w-lg text-xs leading-5 text-muted-foreground">
          <FormattedMessage {...knowledgeUploadSectionMessages.formats} />
        </p>
        {selectedFiles.length > 0 ? (
          <div className="mt-1 space-y-1">
            <p className="text-xs font-medium text-foreground">
              <FormattedMessage
                {...knowledgeUploadSectionMessages.selectedFiles}
                values={{ count: selectedFiles.length }}
              />
            </p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept={KNOWLEDGE_UPLOAD_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) {
              applyFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...knowledgeUploadSectionMessages.or} />
      </p>

      <div className="flex flex-wrap gap-2">
        <UploadSourceButton
          icon={<SimpleBrandIcon icon={siGoogledrive} colored className="size-4" />}
          label={<FormattedMessage {...knowledgeUploadSectionMessages.googleDrive} />}
          onClick={() => handleAction("google-drive")}
        />
        <UploadSourceButton
          icon={<SharePointMark />}
          label={<FormattedMessage {...knowledgeUploadSectionMessages.sharepoint} />}
          onClick={() => handleAction("sharepoint")}
        />
        <UploadSourceButton
          icon={<SimpleBrandIcon icon={siNotion} colored className="size-4" />}
          label={<FormattedMessage {...knowledgeUploadSectionMessages.notion} />}
          onClick={() => handleAction("notion")}
        />
        <UploadSourceButton
          icon={
            <HugeiconsIcon
              icon={Layers01Icon}
              strokeWidth={1.8}
              className="size-4 text-muted-foreground"
            />
          }
          label={<FormattedMessage {...knowledgeUploadSectionMessages.importWebsite} />}
          onClick={() => handleAction("import-website")}
        />
        <UploadSourceButton
          icon={
            <HugeiconsIcon
              icon={TextFontIcon}
              strokeWidth={1.8}
              className="size-4 text-muted-foreground"
            />
          }
          label={<FormattedMessage {...knowledgeUploadSectionMessages.markdownText} />}
          onClick={() => handleAction("markdown-text")}
        />
      </div>
    </section>
  );
}
