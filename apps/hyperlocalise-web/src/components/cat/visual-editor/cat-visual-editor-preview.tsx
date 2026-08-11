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
import type { ReactNode } from "react";

import { QueueStatusDot } from "@/components/cat/segment/cat-segment-status";
import { cn } from "@/lib/primitives/cn";

import type { CatVisualEditorSegment } from "./cat-visual-editor.fixture";

function textForSegment(segment: CatVisualEditorSegment | undefined, fallback: string) {
  if (!segment) {
    return fallback;
  }
  return segment.targetText.trim() || segment.sourceText;
}

function TranslatableNode({
  segment,
  selectedSegmentId,
  highlightTranslatable,
  className,
  onSelect,
  children,
}: {
  segment: CatVisualEditorSegment;
  selectedSegmentId: string | null;
  highlightTranslatable: boolean;
  className?: string;
  onSelect: (segmentId: string) => void;
  children: ReactNode;
}) {
  const isSelected = selectedSegmentId === segment.id;
  const needsAttention = segment.status === "pending" || segment.status === "needs_review";

  return (
    <button
      type="button"
      data-node={segment.id}
      data-selected={isSelected ? "true" : undefined}
      data-status={segment.status}
      onClick={() => onSelect(segment.id)}
      className={cn(
        "group/node relative rounded-sm text-left transition-[box-shadow,background-color,outline-color]",
        "hover:bg-grove-500/5",
        highlightTranslatable &&
          !isSelected &&
          "outline outline-1 outline-dashed outline-grove-300/25",
        isSelected && "bg-grove-500/10 outline outline-2 outline-grove-400/70",
        className,
      )}
    >
      {needsAttention || isSelected ? (
        <span className="pointer-events-none absolute -top-1 -right-1 z-10 opacity-90">
          <QueueStatusDot status={segment.status} />
        </span>
      ) : null}
      {children}
    </button>
  );
}

export function CatVisualEditorPreview({
  segments,
  selectedSegmentId,
  highlightTranslatable,
  onSelectSegment,
  className,
}: {
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string | null;
  highlightTranslatable: boolean;
  onSelectSegment: (segmentId: string) => void;
  className?: string;
}) {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));

  function renderNode(id: string, fallback: string, className?: string, textClassName?: string) {
    const segment = byId.get(id);
    if (!segment) {
      return <span className={textClassName}>{fallback}</span>;
    }

    return (
      <TranslatableNode
        segment={segment}
        selectedSegmentId={selectedSegmentId}
        highlightTranslatable={highlightTranslatable}
        className={className}
        onSelect={onSelectSegment}
      >
        <span className={textClassName}>{textForSegment(segment, fallback)}</span>
      </TranslatableNode>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-white text-neutral-900 shadow-sm",
        className,
      )}
      data-slot="visual-editor-preview"
    >
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4">
        <div className="text-lg font-semibold tracking-tight">Acme</div>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
          {renderNode("ve-seg-nav-product", "Product", "px-0.5")}
          {renderNode("ve-seg-nav-solutions", "Solutions", "px-0.5")}
          {renderNode("ve-seg-nav-resources", "Resources", "px-0.5")}
          {renderNode("ve-seg-nav-pricing", "Pricing", "px-0.5")}
        </nav>
        {renderNode(
          "ve-seg-nav-cta",
          "Get started",
          "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white",
        )}
      </header>

      <main className="px-8 py-14 sm:px-12 sm:py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
          {renderNode(
            "ve-seg-hero-title",
            "The platform for modern teams",
            "inline-block px-1.5 py-0.5",
            "block text-4xl font-semibold tracking-tight text-balance sm:text-5xl",
          )}

          {renderNode(
            "ve-seg-hero-body",
            "Coordinate launches, keep terminology consistent, and ship every locale with confidence.",
            "inline-block px-1.5 py-0.5",
            "block text-base leading-relaxed text-neutral-600 text-pretty sm:text-lg",
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {renderNode(
              "ve-seg-hero-cta",
              "Start free trial",
              "rounded-md bg-grove-700 px-4 py-2 text-sm font-medium text-white",
            )}
            {renderNode(
              "ve-seg-hero-secondary",
              "Book a demo",
              "rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800",
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
