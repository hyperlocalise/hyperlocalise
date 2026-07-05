"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Cancel01Icon, ZoomInAreaIcon, ZoomOutAreaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";

import { imageLightboxMessages } from "@/components/ui/image-lightbox/image-lightbox.messages";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;

export type ImageLightboxMarker = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ImageLightboxViewportProps = {
  alt: string;
  imageUrl: string;
  markers?: ImageLightboxMarker[];
};

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function ImageLightboxViewport({ alt, imageUrl, markers = [] }: ImageLightboxViewportProps) {
  const intl = useIntl();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const resetView = useCallback(() => {
    setScale(MIN_SCALE);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const applyZoom = useCallback(
    (getNextScale: (currentScale: number) => number, anchor?: { x: number; y: number }) => {
      setScale((currentScale) => {
        const clampedScale = clampScale(getNextScale(currentScale));
        if (clampedScale === currentScale) {
          return currentScale;
        }

        if (anchor && viewportRef.current && clampedScale !== MIN_SCALE) {
          const rect = viewportRef.current.getBoundingClientRect();
          const offsetX = anchor.x - rect.left - rect.width / 2;
          const offsetY = anchor.y - rect.top - rect.height / 2;
          const scaleRatio = clampedScale / currentScale;

          setTranslate((current) => ({
            x: current.x - offsetX * (scaleRatio - 1),
            y: current.y - offsetY * (scaleRatio - 1),
          }));
        } else if (clampedScale === MIN_SCALE) {
          setTranslate({ x: 0, y: 0 });
        }

        return clampedScale;
      });
    },
    [],
  );

  const zoomIn = useCallback(() => {
    applyZoom((currentScale) => currentScale + ZOOM_STEP);
  }, [applyZoom]);

  const zoomOut = useCallback(() => {
    applyZoom((currentScale) => currentScale - ZOOM_STEP);
  }, [applyZoom]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resetView, zoomIn, zoomOut]);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      applyZoom((currentScale) => currentScale + direction, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [applyZoom],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (scale <= MIN_SCALE) {
        return;
      }

      dragStateRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [scale],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.x;
    const deltaY = event.clientY - dragState.y;

    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };

    setTranslate((current) => ({
      x: current.x + deltaX,
      y: current.y + deltaY,
    }));
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (scale > MIN_SCALE) {
        resetView();
        return;
      }

      applyZoom(() => 2, { x: event.clientX, y: event.clientY });
    },
    [applyZoom, resetView, scale],
  );

  return (
    <>
      <div
        ref={viewportRef}
        className={cn(
          "relative min-h-0 flex-1 touch-none overflow-hidden bg-black/40",
          scale > MIN_SCALE ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        )}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <div className="flex size-full items-center justify-center">
          <div
            className="relative max-h-full max-w-full transition-transform duration-75 will-change-transform"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={alt}
              className="block max-h-[calc(100vh-7rem)] max-w-[calc(100vw-2rem)] object-contain select-none"
              draggable={false}
            />
            {markers.map((marker, index) => (
              <span
                key={`${marker.left}-${marker.top}-${index}`}
                className={cn(
                  "pointer-events-none absolute rounded-sm border-2 border-grove-300/90 bg-grove-300/20",
                  "shadow-[0_0_0_1px_rgba(255,255,255,0.35)_inset]",
                )}
                style={{
                  left: `${marker.left}%`,
                  top: `${marker.top}%`,
                  width: `${marker.width}%`,
                  height: `${marker.height}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1 border-t border-white/10 bg-black/60 px-3 py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={zoomOut}
                disabled={scale <= MIN_SCALE}
                aria-label={intl.formatMessage(imageLightboxMessages.zoomOut)}
              >
                <HugeiconsIcon icon={ZoomOutAreaIcon} strokeWidth={2} />
              </Button>
            }
          />
          <TooltipContent side="top">
            <FormattedMessage {...imageLightboxMessages.zoomOut} />
          </TooltipContent>
        </Tooltip>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-16 text-white hover:bg-white/10 hover:text-white"
          onClick={resetView}
          disabled={scale === MIN_SCALE && translate.x === 0 && translate.y === 0}
          aria-label={intl.formatMessage(imageLightboxMessages.resetZoom)}
        >
          <FormattedMessage
            {...imageLightboxMessages.zoomLevel}
            values={{ percent: Math.round(scale * 100) }}
          />
        </Button>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={zoomIn}
                disabled={scale >= MAX_SCALE}
                aria-label={intl.formatMessage(imageLightboxMessages.zoomIn)}
              >
                <HugeiconsIcon icon={ZoomInAreaIcon} strokeWidth={2} />
              </Button>
            }
          />
          <TooltipContent side="top">
            <FormattedMessage {...imageLightboxMessages.zoomIn} />
          </TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

export type ImageLightboxProps = {
  alt: string;
  imageUrl: string;
  markers?: ImageLightboxMarker[];
  title?: string | null;
  trigger: ReactNode;
  triggerClassName?: string;
};

export function ImageLightbox({
  alt,
  imageUrl,
  markers,
  title,
  trigger,
  triggerClassName,
}: ImageLightboxProps) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [viewportKey, setViewportKey] = useState(0);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setViewportKey((current) => current + 1);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(
          "block w-full cursor-zoom-in text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          triggerClassName,
        )}
        aria-label={intl.formatMessage(imageLightboxMessages.openPreview)}
      >
        {trigger}
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="bg-black/85 dark:bg-black/90" />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className="fixed inset-0 z-50 flex flex-col outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 py-3 text-white">
            <p className="truncate text-sm font-medium">{title ?? alt}</p>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DialogPrimitive.Close
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-white hover:bg-white/10 hover:text-white"
                        aria-label={intl.formatMessage(imageLightboxMessages.close)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                      </Button>
                    }
                  />
                }
              />
              <TooltipContent side="bottom" align="end">
                <FormattedMessage {...imageLightboxMessages.close} />
              </TooltipContent>
            </Tooltip>
          </div>

          {open ? (
            <ImageLightboxViewport
              key={viewportKey}
              alt={alt}
              imageUrl={imageUrl}
              markers={markers}
            />
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
