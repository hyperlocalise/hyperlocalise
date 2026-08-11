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

import { cn } from "@/lib/primitives/cn";

import type { CatVisualEditorSegment } from "./cat-visual-editor.fixture";
import { CatVisualEditorInlineEdit } from "./cat-visual-editor-inline-edit";

function textForSegment(segment: CatVisualEditorSegment | undefined, fallback: string) {
  if (!segment) {
    return fallback;
  }
  return segment.targetText.trim() || segment.sourceText;
}

function TranslatableNode({
  segmentId,
  selectedSegmentId,
  highlightTranslatable,
  tagName,
  className,
  onSelect,
  children,
}: {
  segmentId: string;
  selectedSegmentId: string | null;
  highlightTranslatable: boolean;
  tagName: CatVisualEditorSegment["node"]["tagName"];
  className?: string;
  onSelect: (segmentId: string) => void;
  children: ReactNode;
}) {
  const isSelected = selectedSegmentId === segmentId;

  return (
    <button
      type="button"
      data-node={segmentId}
      data-selected={isSelected ? "true" : undefined}
      onClick={() => onSelect(segmentId)}
      className={cn(
        "relative rounded-sm text-left transition-[box-shadow,background-color]",
        highlightTranslatable &&
          !isSelected &&
          "outline outline-1 outline-dashed outline-grove-300/45 hover:bg-grove-500/5",
        isSelected &&
          "bg-grove-500/8 outline outline-2 outline-dashed outline-grove-300 ring-4 ring-grove-500/10",
        className,
      )}
    >
      {isSelected ? (
        <span className="absolute -top-2.5 left-2 z-10 rounded bg-grove-700 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
          {tagName}
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
  showInlineEdit,
  onSelectSegment,
  onTargetChange,
  onConfirmInline,
  onApplyAi,
  className,
}: {
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string | null;
  highlightTranslatable: boolean;
  showInlineEdit: boolean;
  onSelectSegment: (segmentId: string) => void;
  onTargetChange: (value: string) => void;
  onConfirmInline: () => void;
  onApplyAi?: () => void;
  className?: string;
}) {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const selected = selectedSegmentId ? byId.get(selectedSegmentId) : undefined;

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
          {(
            [
              ["ve-seg-nav-product", "Product"],
              ["ve-seg-nav-solutions", "Solutions"],
              ["ve-seg-nav-resources", "Resources"],
              ["ve-seg-nav-pricing", "Pricing"],
            ] as const
          ).map(([id, fallback]) => (
            <TranslatableNode
              key={id}
              segmentId={id}
              selectedSegmentId={selectedSegmentId}
              highlightTranslatable={highlightTranslatable}
              tagName="A"
              className="px-0.5"
              onSelect={onSelectSegment}
            >
              <span>{textForSegment(byId.get(id), fallback)}</span>
            </TranslatableNode>
          ))}
        </nav>
        <TranslatableNode
          segmentId="ve-seg-nav-cta"
          selectedSegmentId={selectedSegmentId}
          highlightTranslatable={highlightTranslatable}
          tagName="BUTTON"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
          onSelect={onSelectSegment}
        >
          <span>{textForSegment(byId.get("ve-seg-nav-cta"), "Get started")}</span>
        </TranslatableNode>
      </header>

      <main className="relative px-8 py-14 sm:px-12 sm:py-16">
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          <TranslatableNode
            segmentId="ve-seg-hero-title"
            selectedSegmentId={selectedSegmentId}
            highlightTranslatable={highlightTranslatable}
            tagName="H1"
            className="inline-block px-2 py-1"
            onSelect={onSelectSegment}
          >
            <span className="block text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              {textForSegment(byId.get("ve-seg-hero-title"), "The platform for modern teams")}
            </span>
          </TranslatableNode>

          {showInlineEdit && selected?.id === "ve-seg-hero-title" ? (
            <div className="flex justify-center">
              <CatVisualEditorInlineEdit
                value={selected.targetText}
                maxLength={selected.maxLength}
                onChange={onTargetChange}
                onConfirm={onConfirmInline}
                onApplyAi={onApplyAi}
              />
            </div>
          ) : null}

          <TranslatableNode
            segmentId="ve-seg-hero-body"
            selectedSegmentId={selectedSegmentId}
            highlightTranslatable={highlightTranslatable}
            tagName="P"
            className="inline-block px-2 py-1"
            onSelect={onSelectSegment}
          >
            <span className="block text-base leading-relaxed text-neutral-600 text-pretty sm:text-lg">
              {textForSegment(
                byId.get("ve-seg-hero-body"),
                "Coordinate launches, keep terminology consistent, and ship every locale with confidence.",
              )}
            </span>
          </TranslatableNode>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <TranslatableNode
              segmentId="ve-seg-hero-cta"
              selectedSegmentId={selectedSegmentId}
              highlightTranslatable={highlightTranslatable}
              tagName="BUTTON"
              className="rounded-md bg-grove-700 px-4 py-2 text-sm font-medium text-white"
              onSelect={onSelectSegment}
            >
              <span>{textForSegment(byId.get("ve-seg-hero-cta"), "Start free trial")}</span>
            </TranslatableNode>
            <TranslatableNode
              segmentId="ve-seg-hero-secondary"
              selectedSegmentId={selectedSegmentId}
              highlightTranslatable={highlightTranslatable}
              tagName="BUTTON"
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800"
              onSelect={onSelectSegment}
            >
              <span>{textForSegment(byId.get("ve-seg-hero-secondary"), "Book a demo")}</span>
            </TranslatableNode>
          </div>
        </div>

        {showInlineEdit && selected && selected.id !== "ve-seg-hero-title" ? (
          <div className="absolute right-6 bottom-6 left-6 flex justify-center sm:right-10 sm:left-auto">
            <CatVisualEditorInlineEdit
              value={selected.targetText}
              maxLength={selected.maxLength}
              onChange={onTargetChange}
              onConfirm={onConfirmInline}
              onApplyAi={onApplyAi}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
