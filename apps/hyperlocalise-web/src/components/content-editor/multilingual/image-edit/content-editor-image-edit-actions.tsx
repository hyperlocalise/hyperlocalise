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
import { observer } from "mobx-react-lite";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ChatCircleTextIcon,
  EraserIcon,
  ScribbleIcon,
  SelectionBackgroundIcon,
  SparkleIcon,
  TextTIcon,
} from "@phosphor-icons/react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";

import {
  IMAGE_EDIT_BRUSH_SIZES,
  type ContentEditorImageEditStore,
  type ImageEditBrushSize,
  type ImageEditTool,
} from "./content-editor-image-edit-store";
import { imageEditMessages as messages } from "./content-editor-image-edit.messages";
import { multilingualImageGalleryMessages as galleryMessages } from "../content-editor-multilingual-image-gallery.messages";

const BRUSH_LABELS = {
  small: messages.brushSmall,
  medium: messages.brushMedium,
  large: messages.brushLarge,
} as const;

function ActionButton({
  icon,
  label,
  hint,
  disabled,
  ariaLabel,
  className,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  onClick: () => void;
}) {
  const button = (
    <Button
      size="sm"
      variant="ghost"
      className={cn("w-full justify-start", className)}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
  if (!hint) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex min-w-0" />}>{button}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The hyperlocalisation actions under one locale's image: regenerate it,
 * review its copy, or make a targeted AI edit — Markup, Comment, Remove BG
 * and Erase. While Markup, Comment or Erase is drawn on the image, the panel
 * holds that tool's instruction, undo, cancel and apply instead.
 */
export const ContentEditorImageEditActions = observer(function ContentEditorImageEditActions({
  store,
  segmentId,
  locale,
  language,
  hasImage,
  busy,
  onGenerate,
  onEditCopy,
  canEdit: editable,
  onRemoveBackground,
  onApply,
}: {
  store: ContentEditorImageEditStore;
  segmentId: string;
  locale: string;
  language: string;
  hasImage: boolean;
  /** A generation or edit is running, or the image is still loading. */
  busy: boolean;
  onGenerate?: () => void;
  onEditCopy?: () => void;
  /** The image can be edited with AI. */
  canEdit: boolean;
  onRemoveBackground?: () => void;
  onApply?: () => void;
}) {
  const intl = useIntl();
  const drawingTool = store.toolFor(segmentId, locale);

  if (drawingTool) {
    return <DrawingBar store={store} tool={drawingTool} busy={busy} onApply={() => onApply?.()} />;
  }

  const canEdit = editable && hasImage;
  const begin = (tool: ImageEditTool) => store.begin({ segmentId, locale }, tool);

  if (!onGenerate && !onEditCopy && !canEdit) return null;

  return (
    <div
      role="group"
      aria-label={intl.formatMessage(messages.actions, { language })}
      className="grid grid-cols-2 gap-0.5 rounded-xl border border-border/60 p-1"
    >
      {onGenerate ? (
        <ActionButton
          className="col-span-2"
          icon={
            hasImage ? (
              <ArrowClockwiseIcon data-icon="inline-start" aria-hidden />
            ) : (
              <SparkleIcon data-icon="inline-start" aria-hidden />
            )
          }
          label={intl.formatMessage(
            hasImage ? galleryMessages.regenerate : galleryMessages.generate,
          )}
          ariaLabel={intl.formatMessage(
            hasImage ? galleryMessages.regenerateAria : galleryMessages.generateAria,
            {
              language,
            },
          )}
          disabled={busy}
          onClick={onGenerate}
        />
      ) : null}
      {onEditCopy ? (
        <ActionButton
          icon={<TextTIcon data-icon="inline-start" aria-hidden />}
          label={intl.formatMessage(messages.editCopy)}
          ariaLabel={intl.formatMessage(messages.editCopyAria, { language })}
          onClick={onEditCopy}
        />
      ) : null}
      {canEdit ? (
        <>
          <ActionButton
            icon={<ScribbleIcon data-icon="inline-start" aria-hidden />}
            label={intl.formatMessage(messages.markup)}
            hint={intl.formatMessage(messages.markupHint)}
            disabled={busy}
            onClick={() => begin("markup")}
          />
          <ActionButton
            icon={<ChatCircleTextIcon data-icon="inline-start" aria-hidden />}
            label={intl.formatMessage(messages.comment)}
            hint={intl.formatMessage(messages.commentHint)}
            disabled={busy}
            onClick={() => begin("comment")}
          />
          <ActionButton
            icon={<SelectionBackgroundIcon data-icon="inline-start" aria-hidden />}
            label={intl.formatMessage(messages.removeBackground)}
            hint={intl.formatMessage(messages.removeBackgroundHint)}
            disabled={busy}
            onClick={() => onRemoveBackground?.()}
          />
          <ActionButton
            icon={<EraserIcon data-icon="inline-start" aria-hidden />}
            label={intl.formatMessage(messages.erase)}
            hint={intl.formatMessage(messages.eraseHint)}
            disabled={busy}
            onClick={() => begin("erase")}
          />
        </>
      ) : null}
    </div>
  );
});

const DrawingBar = observer(function DrawingBar({
  store,
  tool,
  busy,
  onApply,
}: {
  store: ContentEditorImageEditStore;
  tool: ImageEditTool;
  busy: boolean;
  onApply: () => void;
}) {
  const intl = useIntl();
  const apply = () => {
    if (store.canApply && !busy) onApply();
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-primary/60 p-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") store.cancel();
      }}
    >
      {tool === "comment" ? (
        <p className="px-1 text-xs text-muted-foreground">
          {intl.formatMessage(store.pins.length ? messages.pinMore : messages.clickToPin)}
        </p>
      ) : (
        <>
          <input
            autoFocus
            value={store.instruction}
            onChange={(event) => store.setInstruction(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
            placeholder={intl.formatMessage(
              tool === "erase"
                ? messages.eraseInstruction
                : store.strokes.length
                  ? messages.describeChange
                  : messages.drawWhere,
            )}
            aria-label={intl.formatMessage(
              tool === "erase" ? messages.eraseInstruction : messages.describeChange,
            )}
            className="h-8 w-full rounded-lg border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div
            role="radiogroup"
            aria-label={intl.formatMessage(messages.brushSize)}
            className="flex items-center gap-0.5"
          >
            {(Object.keys(IMAGE_EDIT_BRUSH_SIZES) as ImageEditBrushSize[]).map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={store.brush === size}
                aria-label={intl.formatMessage(BRUSH_LABELS[size])}
                onClick={() => store.setBrush(size)}
                className={cn(
                  "grid size-7 place-items-center rounded-lg hover:bg-muted",
                  store.brush === size && "bg-muted",
                )}
              >
                <span
                  className="rounded-full bg-foreground"
                  style={{
                    width: IMAGE_EDIT_BRUSH_SIZES[size] * 160,
                    height: IMAGE_EDIT_BRUSH_SIZES[size] * 160,
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="flex items-center justify-end gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={intl.formatMessage(messages.undo)}
          disabled={!store.canUndo}
          onClick={() => store.undo()}
        >
          <ArrowCounterClockwiseIcon aria-hidden />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => store.cancel()}>
          {intl.formatMessage(messages.cancel)}
        </Button>
        <Button size="sm" disabled={!store.canApply || busy} onClick={apply}>
          {intl.formatMessage(tool === "erase" ? messages.applyErase : messages.apply)}
        </Button>
      </div>
    </div>
  );
});
