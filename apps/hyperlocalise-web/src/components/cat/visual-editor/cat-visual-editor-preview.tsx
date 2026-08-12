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
import { FormattedMessage } from "react-intl";

import { QueueStatusDot } from "@/components/cat/segment/cat-segment-status";
import { cn } from "@/lib/primitives/cn";

import { catVisualEditorMessages } from "./cat-visual-editor.messages";
import type { CatVisualEditorPreviewKind, CatVisualEditorSegment } from "./cat-visual-editor.types";

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

function createSegmentRenderer(
  segments: CatVisualEditorSegment[],
  selectedSegmentId: string | null,
  highlightTranslatable: boolean,
  onSelectSegment: (segmentId: string) => void,
) {
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

  return { renderNode };
}

const HOME_LOGOS = ["Northwind", "Helix", "Orbit", "Lattice", "Cascade"] as const;

type RenderNode = (
  id: string,
  fallback: string,
  className?: string,
  textClassName?: string,
) => ReactNode;

function HomePageChrome({ renderNode }: { renderNode: RenderNode }) {
  return (
    <>
      <section
        data-node="trust"
        className="border-t border-neutral-200 bg-neutral-50/80 px-6 py-10 sm:px-10"
      >
        <div className="flex justify-center">
          {renderNode(
            "ve-seg-trust-eyebrow",
            "Trusted by teams shipping worldwide",
            "inline-block px-1",
            "block text-center text-[11px] font-medium tracking-[0.18em] text-neutral-400 uppercase",
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {HOME_LOGOS.map((logo) => (
            <span key={logo} className="text-sm font-semibold tracking-tight text-neutral-300">
              {logo}
            </span>
          ))}
        </div>
      </section>

      <section
        data-node="features"
        className="border-t border-neutral-200 px-6 py-12 sm:px-10 sm:py-14"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-2 text-center">
            {renderNode(
              "ve-seg-features-eyebrow",
              "Why teams switch",
              "inline-block px-1",
              "block text-xs font-medium tracking-[0.14em] text-grove-700 uppercase",
            )}
            {renderNode(
              "ve-seg-features-title",
              "Everything you need to localize with confidence",
              "inline-block px-1.5 py-0.5",
              "block text-2xl font-semibold tracking-tight text-neutral-900 text-balance sm:text-3xl",
            )}
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {(
              [
                {
                  mark: "01",
                  titleId: "ve-seg-feature-1-title",
                  titleFallback: "Release coordination",
                  bodyId: "ve-seg-feature-1-body",
                  bodyFallback:
                    "Align copy freezes, reviewers, and ship windows across every market.",
                  node: "feature-1",
                },
                {
                  mark: "02",
                  titleId: "ve-seg-feature-2-title",
                  titleFallback: "Terminology control",
                  bodyId: "ve-seg-feature-2-body",
                  bodyFallback:
                    "Keep product language consistent with shared glossaries and memory.",
                  node: "feature-2",
                },
                {
                  mark: "03",
                  titleId: "ve-seg-feature-3-title",
                  titleFallback: "Locale confidence",
                  bodyId: "ve-seg-feature-3-body",
                  bodyFallback: "Catch regressions before launch with visual review in context.",
                  node: "feature-3",
                },
              ] as const
            ).map((feature) => (
              <article
                key={feature.node}
                data-node={feature.node}
                className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-5"
              >
                <span className="font-mono text-[11px] font-medium text-grove-700">
                  {feature.mark}
                </span>
                <div className="mt-3">
                  {renderNode(
                    feature.titleId,
                    feature.titleFallback,
                    "inline-block px-0.5",
                    "block text-sm font-semibold text-neutral-900",
                  )}
                </div>
                <div className="mt-2">
                  {renderNode(
                    feature.bodyId,
                    feature.bodyFallback,
                    "inline-block px-0.5",
                    "block text-sm leading-relaxed text-neutral-500",
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        data-node="product"
        className="border-t border-neutral-200 bg-[linear-gradient(180deg,#fafafa_0%,#ffffff_55%)] px-6 py-12 sm:px-10 sm:py-14"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex max-w-lg flex-col gap-2">
            {renderNode(
              "ve-seg-product-title",
              "Review every string in the real layout",
              "inline-block px-1.5 py-0.5",
              "block text-2xl font-semibold tracking-tight text-neutral-900 text-balance sm:text-3xl",
            )}
            {renderNode(
              "ve-seg-product-body",
              "Spot truncation, wrapping, and tone issues before they reach production.",
              "inline-block px-1.5 py-0.5",
              "block text-sm leading-relaxed text-neutral-500",
            )}
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)]"
          >
            <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-neutral-300" />
              <span className="size-2.5 rounded-full bg-neutral-300" />
              <span className="size-2.5 rounded-full bg-neutral-300" />
              <div className="ml-3 flex-1 rounded-md border border-neutral-200 bg-white px-3 py-1 text-[11px] text-neutral-400">
                app.acme.com/projects/northwind
              </div>
            </div>
            <div className="grid min-h-56 grid-cols-[7.5rem_minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)]">
              <aside className="space-y-2 border-r border-neutral-200 bg-neutral-50/90 p-3">
                <div className="h-2 w-14 rounded bg-neutral-200" />
                <div className="mt-4 space-y-1.5">
                  <div className="h-7 rounded-md bg-grove-700/10 ring-1 ring-grove-700/15" />
                  <div className="h-7 rounded-md bg-neutral-200/70" />
                  <div className="h-7 rounded-md bg-neutral-200/70" />
                  <div className="h-7 rounded-md bg-neutral-200/70" />
                </div>
              </aside>
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="h-3 w-28 rounded bg-neutral-900/80" />
                    <div className="h-2 w-40 rounded bg-neutral-200" />
                  </div>
                  <div className="h-7 w-20 rounded-md bg-grove-700" />
                </div>
                <div className="overflow-hidden rounded-lg border border-neutral-200">
                  <div className="grid grid-cols-[1.2fr_1fr_0.7fr] gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
                    <div className="h-2 rounded bg-neutral-300" />
                    <div className="h-2 rounded bg-neutral-300" />
                    <div className="h-2 rounded bg-neutral-300" />
                  </div>
                  {[78, 54, 91, 36].map((progress) => (
                    <div
                      key={progress}
                      className="grid grid-cols-[1.2fr_1fr_0.7fr] items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-b-0"
                    >
                      <div className="h-2 rounded bg-neutral-200" />
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-grove-700/80"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="h-2 w-10 justify-self-end rounded bg-neutral-200" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 bg-neutral-950 px-6 py-10 text-neutral-300 sm:px-10">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
          <div>
            <div className="text-base font-semibold tracking-tight text-white">Acme</div>
            <div className="mt-2 max-w-xs">
              {renderNode(
                "ve-seg-footer-tagline",
                "The operating system for modern localization teams.",
                "inline-block px-0.5",
                "block text-sm leading-relaxed text-neutral-500",
              )}
            </div>
          </div>
          <div data-col="product">
            {renderNode(
              "ve-seg-footer-col-product",
              "Product",
              "inline-block px-0.5",
              "block text-xs font-medium tracking-[0.12em] text-neutral-500 uppercase",
            )}
            <ul className="mt-3 space-y-2 text-sm text-neutral-400">
              <li>
                {renderNode("ve-seg-footer-link-overview", "Overview", "inline-block px-0.5")}
              </li>
              <li>
                {renderNode(
                  "ve-seg-footer-link-integrations",
                  "Integrations",
                  "inline-block px-0.5",
                )}
              </li>
              <li>
                {renderNode("ve-seg-footer-link-changelog", "Changelog", "inline-block px-0.5")}
              </li>
            </ul>
          </div>
          <div data-col="company">
            {renderNode(
              "ve-seg-footer-col-company",
              "Company",
              "inline-block px-0.5",
              "block text-xs font-medium tracking-[0.12em] text-neutral-500 uppercase",
            )}
            <ul className="mt-3 space-y-2 text-sm text-neutral-400">
              <li>{renderNode("ve-seg-footer-link-about", "About", "inline-block px-0.5")}</li>
              <li>{renderNode("ve-seg-footer-link-careers", "Careers", "inline-block px-0.5")}</li>
              <li>{renderNode("ve-seg-footer-link-contact", "Contact", "inline-block px-0.5")}</li>
            </ul>
          </div>
          <div data-col="resources">
            {renderNode(
              "ve-seg-footer-col-resources",
              "Resources",
              "inline-block px-0.5",
              "block text-xs font-medium tracking-[0.12em] text-neutral-500 uppercase",
            )}
            <ul className="mt-3 space-y-2 text-sm text-neutral-400">
              <li>{renderNode("ve-seg-footer-link-docs", "Docs", "inline-block px-0.5")}</li>
              <li>{renderNode("ve-seg-footer-link-guides", "Guides", "inline-block px-0.5")}</li>
              <li>{renderNode("ve-seg-footer-link-support", "Support", "inline-block px-0.5")}</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-5xl border-t border-white/10 pt-5">
          {renderNode(
            "ve-seg-footer-copyright",
            "© 2026 Acme Inc. All rights reserved.",
            "inline-block px-0.5",
            "block text-xs text-neutral-600",
          )}
        </div>
      </footer>
    </>
  );
}

function HomePreview({
  segments,
  selectedSegmentId,
  highlightTranslatable,
  onSelectSegment,
}: {
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string | null;
  highlightTranslatable: boolean;
  onSelectSegment: (segmentId: string) => void;
}) {
  const { renderNode } = createSegmentRenderer(
    segments,
    selectedSegmentId,
    highlightTranslatable,
    onSelectSegment,
  );

  return (
    <>
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

      <main>
        <section className="relative overflow-hidden border-b border-neutral-200 bg-[radial-gradient(120%_80%_at_50%_-10%,#ecfdf3_0%,#ffffff_55%)] px-8 py-14 sm:px-12 sm:py-16">
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
        </section>
      </main>

      <HomePageChrome renderNode={renderNode} />
    </>
  );
}

function PricingPreview({
  segments,
  selectedSegmentId,
  highlightTranslatable,
  onSelectSegment,
}: {
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string | null;
  highlightTranslatable: boolean;
  onSelectSegment: (segmentId: string) => void;
}) {
  const { renderNode } = createSegmentRenderer(
    segments,
    selectedSegmentId,
    highlightTranslatable,
    onSelectSegment,
  );

  return (
    <main className="px-8 py-14 sm:px-12 sm:py-16">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        {renderNode(
          "ve-seg-pricing-title",
          "Simple pricing for every team",
          "inline-block px-1.5 py-0.5",
          "block text-4xl font-semibold tracking-tight text-balance sm:text-5xl",
        )}
        {renderNode(
          "ve-seg-pricing-body",
          "Start free, then scale seats and locales as you grow.",
          "inline-block px-1.5 py-0.5",
          "block text-base leading-relaxed text-neutral-600 text-pretty sm:text-lg",
        )}
        {renderNode(
          "ve-seg-pricing-cta",
          "Compare plans",
          "rounded-md bg-grove-700 px-4 py-2 text-sm font-medium text-white",
        )}
      </div>
    </main>
  );
}

function GenericPreview({
  segments,
  selectedSegmentId,
  highlightTranslatable,
  onSelectSegment,
}: {
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string | null;
  highlightTranslatable: boolean;
  onSelectSegment: (segmentId: string) => void;
}) {
  if (segments.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center px-6 text-center text-sm text-neutral-500">
        <FormattedMessage {...catVisualEditorMessages.previewEmptyFile} />
      </div>
    );
  }

  const [title, ...rest] = segments;

  return (
    <main className="space-y-5 px-8 py-14 sm:px-12 sm:py-16">
      {title ? (
        <TranslatableNode
          segment={title}
          selectedSegmentId={selectedSegmentId}
          highlightTranslatable={highlightTranslatable}
          className="inline-block px-1.5 py-0.5"
          onSelect={onSelectSegment}
        >
          <span className="block text-3xl font-semibold tracking-tight text-balance">
            {textForSegment(title, title.sourceText)}
          </span>
        </TranslatableNode>
      ) : null}
      <div className="space-y-3">
        {rest.map((segment) => (
          <TranslatableNode
            key={segment.id}
            segment={segment}
            selectedSegmentId={selectedSegmentId}
            highlightTranslatable={highlightTranslatable}
            className="block w-full px-1.5 py-0.5"
            onSelect={onSelectSegment}
          >
            <span className="block text-base leading-relaxed text-neutral-600 text-pretty">
              {textForSegment(segment, segment.sourceText)}
            </span>
          </TranslatableNode>
        ))}
      </div>
    </main>
  );
}

export function CatVisualEditorPreview({
  previewKind,
  segments,
  selectedSegmentId,
  highlightTranslatable,
  onSelectSegment,
  className,
}: {
  previewKind: CatVisualEditorPreviewKind;
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string | null;
  highlightTranslatable: boolean;
  onSelectSegment: (segmentId: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-white text-neutral-900 shadow-sm",
        className,
      )}
      data-slot="visual-editor-preview"
      data-preview-kind={previewKind}
    >
      {previewKind === "home" ? (
        <HomePreview
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          highlightTranslatable={highlightTranslatable}
          onSelectSegment={onSelectSegment}
        />
      ) : null}
      {previewKind === "pricing" ? (
        <PricingPreview
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          highlightTranslatable={highlightTranslatable}
          onSelectSegment={onSelectSegment}
        />
      ) : null}
      {previewKind === "generic" ? (
        <GenericPreview
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          highlightTranslatable={highlightTranslatable}
          onSelectSegment={onSelectSegment}
        />
      ) : null}
    </div>
  );
}
