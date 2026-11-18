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
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { CheckIcon, ImageIcon } from "@phosphor-icons/react";
import { useIntl } from "react-intl";

import { aiCreditExhaustedMessages } from "@/components/billing/ai-credit-exhausted.messages";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImageGenerationLoadingCard } from "@/components/ui/image-generation-loading-card";
import { ImageLightbox } from "@/components/ui/image-lightbox/image-lightbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useContentEditorSegmentTarget } from "@/components/content-editor/project-file/use-content-editor-segment-target";
import { ContentEditorSegmentKeyMeta } from "@/components/content-editor/segment/content-editor-segment-key-meta";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";
import { useImageNaturalSize } from "@/components/content-editor/shared/use-image-natural-size";
import { isCatImageFileSegment } from "@/components/content-editor/workspace/content-editor-file-view-capabilities";
import { ContentEditorWorkspaceViewSwitcherConnected } from "@/components/content-editor/workspace/content-editor-workspace-view-switcher-connected";
import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";

import type { ContentEditorImageGenerationStore } from "./content-editor-image-generation-store";
import type { ContentEditorMultilingualConfig } from "./content-editor-multilingual-table";
import { ContentEditorImageEditActions } from "./image-edit/content-editor-image-edit-actions";
import {
  imageEditRequest,
  prepareImageEdit,
  type ImageEditDrawing,
} from "./image-edit/content-editor-image-edit-canvas";
import { ContentEditorImageEditOverlay } from "./image-edit/content-editor-image-edit-overlay";
import { ContentEditorImageEditStore } from "./image-edit/content-editor-image-edit-store";
import { imageEditMessages } from "./image-edit/content-editor-image-edit.messages";
import { multilingualImageGalleryMessages as messages } from "./content-editor-multilingual-image-gallery.messages";
import { multilingualMessages } from "./content-editor-multilingual.messages";

const DEFAULT_ASPECT_RATIO = 4 / 3;
const HTTP_URL_PATTERN = /^https?:\/\//i;

function sourceImageSrc(segment: ContentEditorSegment) {
  if (segment.sourceAssetUrl) return segment.sourceAssetUrl;
  return segment.contentKind === "image_url" && HTTP_URL_PATTERN.test(segment.sourceText)
    ? segment.sourceText
    : null;
}

function ImageFrame({ aspectRatio, children }: { aspectRatio: number; children: ReactNode }) {
  return (
    <div
      className="relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30"
      style={{ aspectRatio }}
    >
      {children}
    </div>
  );
}

function PreviewFrame({
  src,
  alt,
  aspectRatio,
}: {
  src: string;
  alt: string;
  aspectRatio: number;
}) {
  return (
    <ImageLightbox
      alt={alt}
      imageUrl={src}
      triggerClassName="rounded-lg"
      trigger={
        <ImageFrame aspectRatio={aspectRatio}>
          {/* eslint-disable-next-line @next/next/no-img-element -- CAT asset URLs are session-authenticated API paths */}
          <img src={src} alt={alt} loading="lazy" className="size-full object-contain" />
        </ImageFrame>
      }
    />
  );
}

function GalleryCard({
  locale,
  badge,
  children,
  footer,
}: {
  locale: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const intl = useIntl();
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
      <header className="flex min-h-8 items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">
            {formatLocaleDisplayName(intl, locale)}
          </h3>
          <p className="font-mono text-xs text-muted-foreground">{locale}</p>
        </div>
        {badge}
      </header>
      {children}
      {footer ? <footer className="flex flex-wrap items-center gap-2">{footer}</footer> : null}
    </article>
  );
}

const LocaleImageCard = observer(function LocaleImageCard({
  config,
  segment,
  locale,
  aspectRatio,
  sourceSize,
  generations,
  editStore,
  onGenerate,
  onEdit,
  onOpenTranslation,
}: {
  config: ContentEditorMultilingualConfig;
  segment: ContentEditorSegment;
  locale: string;
  aspectRatio: number;
  sourceSize: { width: number; height: number } | null;
  generations: ContentEditorImageGenerationStore;
  editStore: ContentEditorImageEditStore;
  onGenerate?: (options?: { force?: boolean }) => void;
  /** Runs an AI edit on the locale's current image (`imageSrc`). */
  onEdit?: (imageSrc: string, drawing: ImageEditDrawing, options?: { force?: boolean }) => void;
  onOpenTranslation?: () => void;
}) {
  const intl = useIntl();
  const generation = generations.get(segment.id, locale);
  // What waits on confirming that an approved image may be replaced.
  const [pendingApproved, setPendingApproved] = useState<
    { kind: "regenerate" } | { kind: "edit"; imageSrc: string; drawing: ImageEditDrawing } | null
  >(null);
  const [lastAction, setLastAction] = useState<"generate" | "edit">("generate");
  const identity = config.identities?.get(segment.id);
  const query = useContentEditorSegmentTarget({
    organizationSlug: config.organizationSlug,
    projectId: config.projectId,
    sourcePath: identity?.sourcePath || segment.sourcePath || config.sourcePath,
    externalResourceId: identity?.externalResourceId ?? config.externalResourceId,
    resourceType: identity?.resourceType ?? config.resourceType,
    targetLocale: locale,
    externalStringId: segment.id,
    priority: false,
  });
  const target = query.data;
  const targetSrc =
    target?.targetAssetUrl ?? (target && HTTP_URL_PATTERN.test(target.text) ? target.text : null);
  const language = formatLocaleDisplayName(intl, locale);
  const isGenerating = generation?.isRunning === true;
  const isApproved = Boolean(target?.isApproved);
  const drawingTool = editStore.toolFor(segment.id, locale);

  const runGenerate = (options?: { force?: boolean }) => {
    setLastAction("generate");
    onGenerate?.(options);
  };
  const runEdit = (imageSrc: string, drawing: ImageEditDrawing, options?: { force?: boolean }) => {
    setLastAction("edit");
    onEdit?.(imageSrc, drawing, options);
  };
  const requestEdit = (drawing: ImageEditDrawing) => {
    if (!targetSrc) return;
    if (isApproved) {
      setPendingApproved({ kind: "edit", imageSrc: targetSrc, drawing });
      return;
    }
    runEdit(targetSrc, drawing);
  };

  let body: ReactNode;
  if (isGenerating) {
    body = (
      <ImageGenerationLoadingCard
        width={sourceSize?.width}
        height={sourceSize?.height}
        startedAt={generation.startedAt}
        className="rounded-lg"
      />
    );
  } else if (query.isPending) {
    body = <Skeleton className="w-full rounded-lg" style={{ aspectRatio }} />;
  } else if (query.isError && target === undefined) {
    body = (
      <ImageFrame aspectRatio={aspectRatio}>
        <div className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <span>{intl.formatMessage(multilingualMessages.failed)}</span>
          <Button size="xs" variant="outline" onClick={() => void query.refetch()}>
            {intl.formatMessage(multilingualMessages.retry)}
          </Button>
        </div>
      </ImageFrame>
    );
  } else if (targetSrc) {
    const alt = intl.formatMessage(messages.imageAlt, { language });
    body = drawingTool ? (
      <ImageFrame aspectRatio={aspectRatio}>
        {/* eslint-disable-next-line @next/next/no-img-element -- CAT asset URLs are session-authenticated API paths */}
        <img src={targetSrc} alt={alt} className="size-full object-contain" draggable={false} />
        <ContentEditorImageEditOverlay store={editStore} tool={drawingTool} />
      </ImageFrame>
    ) : (
      <PreviewFrame src={targetSrc} alt={alt} aspectRatio={aspectRatio} />
    );
  } else {
    body = (
      <ImageFrame aspectRatio={aspectRatio}>
        <div className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <ImageIcon className="size-6 opacity-60" aria-hidden />
          <span>{intl.formatMessage(messages.missing)}</span>
        </div>
      </ImageFrame>
    );
  }

  return (
    <>
      <GalleryCard
        locale={locale}
        badge={
          isApproved && !isGenerating ? (
            <Badge variant="outline" className="shrink-0 gap-1 text-xs font-normal">
              <CheckIcon className="size-3 text-primary" aria-hidden />
              {intl.formatMessage(multilingualMessages.approved)}
            </Badge>
          ) : null
        }
        footer={
          <div className="w-full">
            <ContentEditorImageEditActions
              store={editStore}
              segmentId={segment.id}
              locale={locale}
              language={language}
              hasImage={Boolean(targetSrc)}
              busy={isGenerating || query.isPending}
              canEdit={Boolean(onEdit)}
              onGenerate={
                onGenerate
                  ? () => {
                      if (isApproved) {
                        setPendingApproved({ kind: "regenerate" });
                        return;
                      }
                      runGenerate();
                    }
                  : undefined
              }
              onEditCopy={onOpenTranslation}
              onRemoveBackground={() => requestEdit({ kind: "removeBackground" })}
              onApply={() => {
                const taken = editStore.takeDrawing();
                if (taken) requestEdit(taken.drawing);
              }}
            />
          </div>
        }
      >
        {body}
        {generation?.status === "failed" ? (
          <p role="alert" className="text-xs text-destructive">
            {intl.formatMessage(
              generation.aiCreditExhausted
                ? aiCreditExhaustedMessages.exhausted
                : lastAction === "edit"
                  ? imageEditMessages.editError
                  : messages.generationError,
            )}
          </p>
        ) : null}
      </GalleryCard>
      <AlertDialog
        open={pendingApproved !== null}
        onOpenChange={(open) => {
          if (!open) setPendingApproved(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {intl.formatMessage(
                pendingApproved?.kind === "edit"
                  ? imageEditMessages.editApprovedTitle
                  : messages.regenerateApprovedTitle,
                { language },
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage(
                pendingApproved?.kind === "edit"
                  ? imageEditMessages.editApprovedDescription
                  : messages.regenerateApprovedDescription,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{intl.formatMessage(messages.cancel)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pending = pendingApproved;
                setPendingApproved(null);
                if (pending?.kind === "edit") {
                  runEdit(pending.imageSrc, pending.drawing, { force: true });
                } else {
                  runGenerate({ force: true });
                }
              }}
            >
              {intl.formatMessage(
                pendingApproved?.kind === "edit"
                  ? imageEditMessages.editApprovedConfirm
                  : messages.regenerateApprovedConfirm,
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

const SegmentImageGallery = observer(function SegmentImageGallery({
  config,
  segment,
  locales,
  showKey,
  generations,
  editStore,
  onGenerate,
  onEdit,
  onOpenTranslation,
}: {
  config: ContentEditorMultilingualConfig;
  segment: ContentEditorSegment;
  locales: readonly string[];
  showKey: boolean;
  generations: ContentEditorImageGenerationStore;
  editStore: ContentEditorImageEditStore;
  onGenerate?: (
    segment: ContentEditorSegment,
    locale: string,
    options?: { force?: boolean },
  ) => void;
  onEdit?: (
    segment: ContentEditorSegment,
    locale: string,
    imageSrc: string,
    drawing: ImageEditDrawing,
    options?: { force?: boolean },
  ) => void;
  onOpenTranslation?: (segment: ContentEditorSegment, locale: string) => void;
}) {
  const intl = useIntl();
  const sourceSrc = sourceImageSrc(segment);
  const sourceSize = useImageNaturalSize(sourceSrc);
  const aspectRatio = sourceSize ? sourceSize.width / sourceSize.height : DEFAULT_ASPECT_RATIO;
  const canGenerate = Boolean(onGenerate) && config.canEdit !== false && !segment.isLocked;
  const canEditImage = Boolean(onEdit) && config.canEdit !== false && !segment.isLocked;

  return (
    <section className="space-y-3">
      {showKey ? (
        <ContentEditorSegmentKeyMeta segmentKey={segment.key} sourcePath={segment.sourcePath} />
      ) : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
        <li className="min-w-0">
          <GalleryCard
            locale={config.sourceLocale}
            badge={
              <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                {intl.formatMessage(messages.original)}
              </Badge>
            }
          >
            {sourceSrc ? (
              <PreviewFrame
                src={sourceSrc}
                alt={intl.formatMessage(messages.imageAlt, {
                  language: formatLocaleDisplayName(intl, config.sourceLocale),
                })}
                aspectRatio={aspectRatio}
              />
            ) : (
              <ImageFrame aspectRatio={aspectRatio}>
                <ImageIcon className="size-6 text-muted-foreground opacity-60" aria-hidden />
              </ImageFrame>
            )}
          </GalleryCard>
        </li>
        {locales.map((locale) => (
          <li key={locale} className="min-w-0">
            <LocaleImageCard
              config={config}
              segment={segment}
              locale={locale}
              aspectRatio={aspectRatio}
              sourceSize={sourceSize}
              generations={generations}
              editStore={editStore}
              onGenerate={
                canGenerate && sourceSrc
                  ? (options) => onGenerate?.(segment, locale, options)
                  : undefined
              }
              onEdit={
                canEditImage
                  ? (imageSrc, drawing, options) =>
                      onEdit?.(segment, locale, imageSrc, drawing, options)
                  : undefined
              }
              onOpenTranslation={
                onOpenTranslation ? () => onOpenTranslation(segment, locale) : undefined
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
});

export const ContentEditorMultilingualImageGallery = observer(
  function ContentEditorMultilingualImageGallery({
    config,
    segments,
    isLoading = false,
    hasMore = false,
    isLoadingMore = false,
    onLoadMore,
    onOpenTranslation,
    generations,
  }: {
    config: ContentEditorMultilingualConfig;
    segments: ContentEditorSegment[];
    isLoading?: boolean;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
    onOpenTranslation?: (segment: ContentEditorSegment, locale: string) => void;
    generations: ContentEditorImageGenerationStore;
  }) {
    const intl = useIntl();
    const [hiddenLocales, setHiddenLocales] = useState<ReadonlySet<string>>(() => new Set());
    const locales = useMemo(() => [...new Set(config.targetLocales)], [config.targetLocales]);
    const visibleLocales = useMemo(
      () => locales.filter((locale) => !hiddenLocales.has(locale)),
      [locales, hiddenLocales],
    );
    const { onRegenerateImage, onEditImage } = config;
    const [editStore] = useState(() => new ContentEditorImageEditStore());
    const imageSegments = useMemo(
      () =>
        segments.filter((segment) =>
          isCatImageFileSegment({
            sourcePath: segment.sourcePath,
            contentKind: segment.contentKind,
          }),
        ),
      [segments],
    );
    const generate = useCallback(
      async (segment: ContentEditorSegment, locale: string, options?: { force?: boolean }) => {
        if (!onRegenerateImage) return;
        await generations.run(segment.id, locale, (signal) =>
          onRegenerateImage(segment, locale, { ...options, signal }),
        );
      },
      [generations, onRegenerateImage],
    );
    const edit = useCallback(
      async (
        segment: ContentEditorSegment,
        locale: string,
        imageSrc: string,
        drawing: ImageEditDrawing,
        options?: { force?: boolean },
      ) => {
        if (!onEditImage) return;
        await generations.run(segment.id, locale, async (signal) => {
          const response = await fetch(imageSrc, { signal });
          if (!response.ok) throw new Error("Could not load the image to edit");
          const { image, mask, references } = await prepareImageEdit(
            await response.blob(),
            drawing,
          );
          await onEditImage(segment, locale, {
            request: imageEditRequest(drawing),
            image,
            mask,
            references,
            force: options?.force,
            signal,
          });
        });
      },
      [generations, onEditImage],
    );
    const runningCount = generations.runningCount;

    return (
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
          <p className="truncate text-xs text-muted-foreground">
            {intl.formatMessage(messages.hint)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                {intl.formatMessage(multilingualMessages.languages)}{" "}
                <span className="tabular-nums">{visibleLocales.length}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {locales.map((locale) => (
                    <DropdownMenuCheckboxItem
                      key={locale}
                      checked={!hiddenLocales.has(locale)}
                      onCheckedChange={(checked) => {
                        setHiddenLocales((previous) => {
                          const next = new Set(previous);
                          if (checked) next.delete(locale);
                          else next.add(locale);
                          return next;
                        });
                      }}
                    >
                      {formatLocaleDisplayName(intl, locale)}{" "}
                      <span className="text-muted-foreground">{locale}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <ContentEditorWorkspaceViewSwitcherConnected size="sm" variant="outline" />
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto bg-muted/30"
          role="region"
          aria-label={intl.formatMessage(messages.title)}
          aria-busy={isLoading}
        >
          {imageSegments.length === 0 ? (
            <p role="status" className="p-6 text-sm text-muted-foreground">
              {intl.formatMessage(
                isLoading ? multilingualMessages.loading : multilingualMessages.empty,
              )}
            </p>
          ) : (
            <div className="mx-auto flex max-w-[96rem] flex-col gap-8 p-4 sm:p-6">
              {imageSegments.map((segment) => (
                <SegmentImageGallery
                  key={segment.id}
                  config={config}
                  segment={segment}
                  locales={visibleLocales}
                  showKey={imageSegments.length > 1}
                  generations={generations}
                  editStore={editStore}
                  onEdit={
                    onEditImage
                      ? (nextSegment, locale, imageSrc, drawing, options) =>
                          void edit(nextSegment, locale, imageSrc, drawing, options)
                      : undefined
                  }
                  onGenerate={
                    onRegenerateImage
                      ? (nextSegment, locale, options) =>
                          void generate(nextSegment, locale, options)
                      : undefined
                  }
                  onOpenTranslation={onOpenTranslation}
                />
              ))}
            </div>
          )}
        </div>
        {runningCount > 0 || hasMore ? (
          <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-t px-3 py-1 text-xs text-muted-foreground">
            <span role="status">
              {runningCount > 0
                ? intl.formatMessage(messages.generatingCount, { count: runningCount })
                : null}
            </span>
            {hasMore ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={isLoadingMore || isLoading}
                onClick={onLoadMore}
              >
                {intl.formatMessage(
                  isLoadingMore ? multilingualMessages.loading : multilingualMessages.more,
                )}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  },
);
