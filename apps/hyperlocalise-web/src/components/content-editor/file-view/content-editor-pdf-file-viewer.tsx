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
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";

import { contentEditorFileViewMessages } from "@/components/content-editor/file-view/content-editor-file-view.messages";
import { cn } from "@/lib/primitives/cn";

const PDF_OVERFLOW_HEADER = "x-hyperlocalise-overflow-keys";

type PdfLoadResult =
  | { kind: "pdf"; bytes: Uint8Array; overflowKeyCount: number }
  | { kind: "missing" }
  | { kind: "script_unsupported"; message: string }
  | { kind: "error"; message: string };

async function loadPdfFromUrl(src: string): Promise<PdfLoadResult> {
  try {
    return await fetchPdf(src);
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchPdf(src: string): Promise<PdfLoadResult> {
  const response = await fetch(src, { credentials: "include" });
  if (response.status === 404) {
    return { kind: "missing" };
  }
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!response.ok) {
    if (contentType.includes("json")) {
      const body = (await response.json()) as { error?: string; message?: string };
      if (body.error === "pdf_script_unsupported") {
        return {
          kind: "script_unsupported",
          message: body.message ?? "",
        };
      }
      if (body.message?.trim()) {
        return { kind: "error", message: body.message };
      }
    }
    return { kind: "error", message: `HTTP ${response.status}` };
  }
  if (!contentType.includes("pdf")) {
    return { kind: "missing" };
  }
  const overflowHeader = response.headers.get(PDF_OVERFLOW_HEADER);
  const overflowKeyCount = overflowHeader
    ? overflowHeader.split(",").filter((key) => key.trim()).length
    : 0;
  return {
    kind: "pdf",
    bytes: new Uint8Array(await response.arrayBuffer()),
    overflowKeyCount,
  };
}

function PdfCanvasPages({ bytes, className }: { bytes: Uint8Array; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const abortController = new AbortController();
    const { signal } = abortController;

    async function render() {
      setError(null);
      const mount = containerRef.current;
      if (!mount) {
        return;
      }
      try {
        const unpdf = (await import("unpdf")) as unknown as {
          getDocumentProxy: (data: Uint8Array) => Promise<{
            numPages: number;
            getPage: (pageNumber: number) => Promise<{
              getViewport: (options: { scale: number }) => { width: number; height: number };
              render: (options: {
                canvasContext: CanvasRenderingContext2D;
                viewport: { width: number; height: number };
                canvas: HTMLCanvasElement;
              }) => { promise: Promise<void> };
            }>;
            loadingTask: { destroy: () => Promise<void> };
          }>;
        };
        const pdf = await unpdf.getDocumentProxy(bytes.slice());
        try {
          if (signal.aborted) {
            return;
          }
          setPageCount(pdf.numPages);
          mount.replaceChildren();

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            if (signal.aborted) {
              break;
            }
            const page = await pdf.getPage(pageNumber);
            const containerWidth = Math.max(mount.clientWidth, 320);
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = containerWidth / baseViewport.width;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width * devicePixelRatio);
            canvas.height = Math.floor(viewport.height * devicePixelRatio);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            canvas.className = "mx-auto block max-w-full bg-white shadow-sm";
            const context = canvas.getContext("2d");
            if (!context) {
              continue;
            }
            context.scale(devicePixelRatio, devicePixelRatio);
            await page.render({ canvasContext: context, viewport, canvas }).promise;
            if (signal.aborted) {
              break;
            }
            const wrapper = document.createElement("div");
            wrapper.className = "mb-4 flex justify-center";
            wrapper.appendChild(canvas);
            mount.appendChild(wrapper);
          }
        } finally {
          void pdf.loadingTask.destroy();
        }
      } catch (renderError) {
        if (!signal.aborted) {
          setError(renderError instanceof Error ? renderError.message : String(renderError));
        }
      }
    }

    void render();
    return () => {
      abortController.abort();
      containerRef.current?.replaceChildren();
    };
  }, [bytes]);

  if (error) {
    return (
      <div
        className={cn(
          "flex min-h-56 items-center justify-center p-4 text-sm text-destructive",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  return (
    <div className={cn("min-h-56 w-full", className)}>
      {pageCount === 0 ? (
        <div className="flex min-h-56 items-center justify-center">
          <CircleNotchIcon className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      <div ref={containerRef} className="w-full py-2" />
    </div>
  );
}

export function ContentEditorPdfFileViewerPane({
  role,
  src,
  seedSrc,
  isLoading,
}: {
  role: "source" | "target";
  src?: string | null;
  seedSrc?: string | null;
  isLoading?: boolean;
}) {
  const [loadState, setLoadState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | {
        status: "ready";
        bytes: Uint8Array;
        overflowKeyCount: number;
        showingSourceFallback: boolean;
      }
    | { status: "script_unsupported"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    async function run() {
      if (isLoading) {
        setLoadState({ status: "idle" });
        return;
      }
      const primary = src?.trim() || null;
      if (!primary) {
        setLoadState({ status: "idle" });
        return;
      }

      setLoadState({ status: "loading" });
      const primaryResult = await loadPdfFromUrl(primary);
      if (signal.aborted) {
        return;
      }

      if (primaryResult.kind === "pdf") {
        setLoadState({
          status: "ready",
          bytes: primaryResult.bytes,
          overflowKeyCount: primaryResult.overflowKeyCount,
          showingSourceFallback: false,
        });
        return;
      }

      if (primaryResult.kind === "script_unsupported") {
        setLoadState({
          status: "script_unsupported",
          message: primaryResult.message,
        });
        return;
      }

      if (primaryResult.kind === "missing" && role === "target" && seedSrc?.trim()) {
        const fallback = await loadPdfFromUrl(seedSrc);
        if (signal.aborted) {
          return;
        }
        if (fallback.kind === "pdf") {
          setLoadState({
            status: "ready",
            bytes: fallback.bytes,
            overflowKeyCount: 0,
            showingSourceFallback: true,
          });
          return;
        }
      }

      if (primaryResult.kind === "error") {
        setLoadState({ status: "error", message: primaryResult.message });
        return;
      }
      setLoadState({ status: "idle" });
    }

    void run();
    return () => abortController.abort();
  }, [isLoading, role, seedSrc, src]);

  if (isLoading || loadState.status === "loading") {
    return (
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border">
        <CircleNotchIcon className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (loadState.status === "script_unsupported") {
    return (
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        {loadState.message.trim() ? (
          loadState.message
        ) : (
          <FormattedMessage {...contentEditorFileViewMessages.pdfScriptUnsupported} />
        )}
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border p-4 text-center text-sm text-destructive">
        {loadState.message}
      </div>
    );
  }

  if (loadState.status !== "ready") {
    return (
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        <FormattedMessage
          {...(role === "source"
            ? contentEditorFileViewMessages.sourceEmpty
            : contentEditorFileViewMessages.targetEmpty)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {loadState.showingSourceFallback ? (
        <p className="text-center text-xs text-muted-foreground">
          <FormattedMessage {...contentEditorFileViewMessages.pdfTargetNotReady} />
        </p>
      ) : null}
      {loadState.overflowKeyCount > 0 ? (
        <p className="text-center text-xs text-amber-600 dark:text-amber-400">
          <FormattedMessage
            {...contentEditorFileViewMessages.pdfOverflowWarning}
            values={{ count: loadState.overflowKeyCount }}
          />
        </p>
      ) : null}
      <PdfCanvasPages bytes={loadState.bytes} />
    </div>
  );
}
