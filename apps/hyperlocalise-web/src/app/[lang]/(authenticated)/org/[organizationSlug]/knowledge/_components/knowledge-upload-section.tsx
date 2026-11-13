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
import { FileTextIcon, StackIcon, TextTIcon, UploadSimpleIcon, XIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { siGoogledrive, siNotion } from "simple-icons";
import { toast } from "sonner";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import {
  filterKnowledgeUploadFiles,
  KNOWLEDGE_EXTERNAL_IMPORT_SOURCES_ENABLED,
  KNOWLEDGE_UPLOAD_ACCEPT,
  KNOWLEDGE_UPLOAD_MAX_BYTES,
  KNOWLEDGE_UPLOAD_MAX_FILES,
  type KnowledgeUploadActionId,
} from "./knowledge-upload.shared";

const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * 1024;

function formatFileSize(intl: IntlShape, bytes: number): string {
  const megabytes = bytes >= BYTES_PER_MEGABYTE;
  return intl.formatNumber(bytes / (megabytes ? BYTES_PER_MEGABYTE : BYTES_PER_KILOBYTE), {
    style: "unit",
    unit: megabytes ? "megabyte" : "kilobyte",
    maximumFractionDigits: megabytes ? 1 : 0,
  });
}

/** Primary-tinted dot grid (matches the featured pricing card), faded toward the bottom. */
const DROPZONE_DOT_GRID_STYLE = {
  backgroundImage:
    "radial-gradient(color-mix(in oklab, var(--primary) 26%, transparent) 1px, transparent 1px)",
  backgroundSize: "12px 12px",
  maskImage: "linear-gradient(to bottom, black, transparent 75%)",
  WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)",
} as const;
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
  selectedFile = null,
  showTitle = true,
  className,
}: {
  onStartMarkdownText: () => void;
  /** Enables file upload. Called with the accepted files, or `[]` when the file is removed. */
  onFilesSelected?: (files: File[]) => void;
  /** The chosen file, owned by the parent. Shows a file row in place of the dropzone. */
  selectedFile?: File | null;
  /** Hide the section heading when the parent already labels it. */
  showTitle?: boolean;
  className?: string;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  // Transient drag highlight only; the chosen file lives in the parent.
  const [isDragging, setIsDragging] = useState(false);
  const canUploadFiles = onFilesSelected != null;

  const clearFiles = () => {
    onFilesSelected?.([]);
  };

  const applyFiles = (incoming: FileList | File[]) => {
    const all = Array.from(incoming);
    if (all.length > KNOWLEDGE_UPLOAD_MAX_FILES) {
      toast.message(intl.formatMessage(knowledgeUploadSectionMessages.tooManyFiles));
      return;
    }

    const accepted = filterKnowledgeUploadFiles(all);
    if (accepted.length === 0 && all.length > 0) {
      toast.message(intl.formatMessage(knowledgeUploadSectionMessages.unsupportedFiles));
      return;
    }
    if (accepted.some((file) => file.size > KNOWLEDGE_UPLOAD_MAX_BYTES)) {
      toast.message(intl.formatMessage(knowledgeUploadSectionMessages.fileTooLarge));
      return;
    }

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
        if (KNOWLEDGE_EXTERNAL_IMPORT_SOURCES_ENABLED) {
          toast.message(intl.formatMessage(knowledgeUploadSectionMessages.comingSoon));
        }
        return;
      case "markdown-text":
        onStartMarkdownText();
        return;
    }
  };

  return (
    <section className={cn("space-y-5", className)}>
      {showTitle ? (
        <h2 className="text-base font-medium text-foreground">
          <FormattedMessage {...knowledgeUploadSectionMessages.title} />
        </h2>
      ) : null}

      {canUploadFiles ? (
        <input
          ref={inputRef}
          type="file"
          accept={KNOWLEDGE_UPLOAD_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            if (event.target.files) {
              applyFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />
      ) : null}

      {canUploadFiles && selectedFile ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileTextIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground" title={selectedFile.name}>
              {selectedFile.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(intl, Math.max(selectedFile.size, BYTES_PER_KILOBYTE))}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
            <FormattedMessage {...knowledgeUploadSectionMessages.replaceFile} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={intl.formatMessage(knowledgeUploadSectionMessages.removeFile)}
            onClick={clearFiles}
          >
            <XIcon />
          </Button>
        </div>
      ) : null}

      {canUploadFiles && !selectedFile ? (
        <>
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
              "relative isolate flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-border bg-[color-mix(in_oklab,var(--primary)_3%,var(--background))] px-6 py-10 text-center transition-colors outline-none hover:border-primary/40 hover:bg-[color-mix(in_oklab,var(--primary)_5%,var(--background))] focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isDragging &&
                "border-primary/60 bg-[color-mix(in_oklab,var(--primary)_8%,var(--background))]",
            )}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10"
              style={DROPZONE_DOT_GRID_STYLE}
            />
            <span className="flex size-11 items-center justify-center rounded-full bg-background text-primary shadow-sm ring-1 ring-border">
              <UploadSimpleIcon className="size-5" />
            </span>
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
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            <FormattedMessage {...knowledgeUploadSectionMessages.or} />
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <div className={cn("flex flex-wrap justify-center gap-2", selectedFile && "hidden")}>
        {KNOWLEDGE_EXTERNAL_IMPORT_SOURCES_ENABLED ? (
          <>
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
              icon={<StackIcon className="size-4 text-muted-foreground" />}
              label={<FormattedMessage {...knowledgeUploadSectionMessages.importWebsite} />}
              onClick={() => handleAction("import-website")}
            />
          </>
        ) : null}
        <UploadSourceButton
          icon={<TextTIcon className="size-4 text-muted-foreground" />}
          label={<FormattedMessage {...knowledgeUploadSectionMessages.markdownText} />}
          onClick={() => handleAction("markdown-text")}
        />
      </div>
    </section>
  );
}
