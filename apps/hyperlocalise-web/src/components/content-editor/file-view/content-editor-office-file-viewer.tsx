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
import { FloppyDiskIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FormattedMessage, useIntl } from "react-intl";

import {
  emptyOfficeSnapshot,
  exportOfficeSnapshotToFile,
  loadOfficeSnapshotFromUrl,
  type ContentEditorOfficeKind,
  type ContentEditorOfficeSnapshot,
} from "@/components/content-editor/file-view/content-editor-office-convert";
import { contentEditorFileViewMessages } from "@/components/content-editor/file-view/content-editor-file-view.messages";
import { ContentEditorOfficeFilePreview } from "@/components/content-editor/file-view/content-editor-office-file-preview";
import { isCatStoryOfficeAssetUrl } from "@/components/content-editor/file-view/content-editor-office-story-assets";
import {
  isCatOfficeKind,
  mountCatUniverHost,
  type ContentEditorUniverHostHandle,
} from "@/components/content-editor/file-view/content-editor-univer-host";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

export function ContentEditorOfficeFileViewerPane({
  kind,
  role,
  src,
  seedSrc,
  filename,
  isLoading,
  canEdit = true,
  isBusy = false,
  onSave,
  saveActionsContainer,
}: {
  kind: ContentEditorOfficeKind;
  role: "source" | "target";
  src?: string | null;
  /** Source file an editable target starts from when no translated file exists. */
  seedSrc?: string | null;
  filename: string;
  isLoading?: boolean;
  canEdit?: boolean;
  isBusy?: boolean;
  onSave?: (file: File) => void | Promise<void>;
  /** Element outside the pane that hosts the Save button, such as the File view header. */
  saveActionsContainer?: HTMLElement | null;
}) {
  const intl = useIntl();
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<ContentEditorUniverHostHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMounting, setIsMounting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<ContentEditorOfficeSnapshot | null>(null);
  const readOnly = role === "source" || !canEdit;
  const loadSrc = src ?? (readOnly ? null : seedSrc);
  const useStoryPreview = isCatStoryOfficeAssetUrl(loadSrc);

  const emptyLabel =
    role === "source"
      ? intl.formatMessage(contentEditorFileViewMessages.sourceEmpty)
      : intl.formatMessage(contentEditorFileViewMessages.targetEmpty);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    async function mountEditor(snapshot: ContentEditorOfficeSnapshot) {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const host = await mountCatUniverHost({ container, snapshot, readOnly, signal });
      if (signal.aborted) {
        host.dispose();
        return;
      }
      hostRef.current = host;
    }

    async function run() {
      setPreviewSnapshot(null);

      if (isLoading) {
        setIsMounting(false);
        setError(null);
        return;
      }

      if (!loadSrc) {
        if (readOnly) {
          setIsMounting(false);
          setError(null);
          return;
        }

        setIsMounting(true);
        setError(null);
        try {
          const snapshot = emptyOfficeSnapshot(kind, filename);
          if (signal.aborted) {
            return;
          }
          await mountEditor(snapshot);
        } catch (mountError) {
          if (signal.aborted) {
            return;
          }
          setError(mountError instanceof Error ? mountError.message : String(mountError));
        } finally {
          if (!signal.aborted) {
            setIsMounting(false);
          }
        }
        return;
      }

      setIsMounting(true);
      setError(null);
      try {
        const snapshot = await loadOfficeSnapshotFromUrl({
          kind,
          src: loadSrc,
          filename,
        });
        if (signal.aborted) {
          return;
        }
        if (useStoryPreview) {
          setPreviewSnapshot(snapshot);
          return;
        }
        await mountEditor(snapshot);
      } catch (mountError) {
        if (signal.aborted) {
          return;
        }
        setError(mountError instanceof Error ? mountError.message : String(mountError));
      } finally {
        if (!signal.aborted) {
          setIsMounting(false);
        }
      }
    }

    void run();

    return () => {
      abortController.abort();
      hostRef.current?.dispose();
      hostRef.current = null;
    };
  }, [filename, isLoading, kind, loadSrc, readOnly, useStoryPreview]);

  async function handleSave() {
    if (!onSave) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const snapshot =
        useStoryPreview && previewSnapshot ? previewSnapshot : hostRef.current?.getSnapshot();
      if (!snapshot) {
        return;
      }
      const file = await exportOfficeSnapshotToFile({ snapshot, filename });
      await onSave(file);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  if (!isCatOfficeKind(kind)) {
    return null;
  }

  const saveButton =
    role === "target" && onSave ? (
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={
          !canEdit ||
          isBusy ||
          isSaving ||
          isMounting ||
          Boolean(isLoading) ||
          (useStoryPreview && !previewSnapshot)
        }
        onClick={() => void handleSave()}
      >
        {isSaving ? (
          <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" aria-hidden />
        ) : (
          <HugeiconsIcon icon={FloppyDiskIcon} className="size-3" aria-hidden />
        )}
        <FormattedMessage {...contentEditorFileViewMessages.saveEdits} />
      </Button>
    ) : null;

  return (
    <div className="flex h-full min-h-56 flex-col gap-2">
      {saveActionsContainer ? (
        createPortal(saveButton, saveActionsContainer)
      ) : saveButton ? (
        <div className="flex justify-end">{saveButton}</div>
      ) : null}
      <div
        className={cn(
          "relative min-h-72 flex-1 overflow-hidden border border-border bg-background",
          !src && readOnly && role === "target" ? "border-dashed" : "",
        )}
      >
        {(isLoading || isMounting) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
            <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        )}
        {!src && !isLoading && readOnly ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-x-0 bottom-2 z-10 px-3 text-center text-xs text-destructive">
            {error}
          </div>
        ) : null}
        {useStoryPreview && previewSnapshot ? (
          <ContentEditorOfficeFilePreview
            snapshot={previewSnapshot}
            className="absolute inset-0 overflow-y-auto"
          />
        ) : (
          // Univer sizes itself to its container, so the container fills the pane.
          <div ref={containerRef} className="absolute inset-0" />
        )}
      </div>
    </div>
  );
}
