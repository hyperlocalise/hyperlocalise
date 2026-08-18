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
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  emptyOfficeSnapshot,
  exportOfficeSnapshotToFile,
  loadOfficeSnapshotFromUrl,
  type CatOfficeKind,
  type CatOfficeSnapshot,
} from "@/components/cat/file-view/cat-office-convert";
import { catFileViewMessages } from "@/components/cat/file-view/cat-file-view.messages";
import {
  isCatOfficeKind,
  mountCatUniverHost,
  type CatUniverHostHandle,
} from "@/components/cat/file-view/cat-univer-host";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

export function CatOfficeFileViewerPane({
  kind,
  role,
  src,
  filename,
  isLoading,
  canEdit = true,
  isBusy = false,
  onSave,
}: {
  kind: CatOfficeKind;
  role: "source" | "target";
  src?: string | null;
  filename: string;
  isLoading?: boolean;
  canEdit?: boolean;
  isBusy?: boolean;
  onSave?: (file: File) => void | Promise<void>;
}) {
  const intl = useIntl();
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<CatUniverHostHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMounting, setIsMounting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const readOnly = role === "source" || !canEdit;

  const emptyLabel =
    role === "source"
      ? intl.formatMessage(catFileViewMessages.sourceEmpty)
      : intl.formatMessage(catFileViewMessages.targetEmpty);

  const mountEditor = useEffectEvent(async (snapshot: CatOfficeSnapshot) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    hostRef.current?.dispose();
    hostRef.current = null;
    container.replaceChildren();
    hostRef.current = await mountCatUniverHost({
      container,
      snapshot,
      readOnly,
    });
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (isLoading) {
        return;
      }
      setIsMounting(true);
      setError(null);
      try {
        const snapshot = src
          ? await loadOfficeSnapshotFromUrl({
              kind,
              src,
              filename,
            })
          : emptyOfficeSnapshot(kind, filename);
        if (cancelled) {
          return;
        }
        await mountEditor(snapshot);
      } catch (mountError) {
        if (cancelled) {
          return;
        }
        setError(mountError instanceof Error ? mountError.message : String(mountError));
        try {
          await mountEditor(emptyOfficeSnapshot(kind, filename));
        } catch {
          // Keep the error message; empty mount may also fail if Univer cannot boot.
        }
      } finally {
        if (!cancelled) {
          setIsMounting(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      hostRef.current?.dispose();
      hostRef.current = null;
    };
  }, [filename, isLoading, kind, mountEditor, src]);

  async function handleSave() {
    if (!onSave || !hostRef.current) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const snapshot = hostRef.current.getSnapshot();
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

  return (
    <div className="flex min-h-56 flex-col gap-2">
      {role === "target" && onSave ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canEdit || isBusy || isSaving || isMounting || Boolean(isLoading)}
            onClick={() => void handleSave()}
          >
            {isSaving ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" aria-hidden />
            ) : (
              <HugeiconsIcon icon={FloppyDiskIcon} className="size-3" aria-hidden />
            )}
            <FormattedMessage {...catFileViewMessages.saveEdits} />
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          "relative min-h-72 overflow-hidden border border-border bg-background",
          !src && role === "target" ? "border-dashed" : "",
        )}
      >
        {(isLoading || isMounting) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
            <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        )}
        {!src && !isLoading ? (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 px-3 text-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-x-0 bottom-2 z-10 px-3 text-center text-xs text-destructive">
            {error}
          </div>
        ) : null}
        <div ref={containerRef} className="h-[28rem] w-full" />
      </div>
    </div>
  );
}
