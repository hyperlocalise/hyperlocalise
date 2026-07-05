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

import {
  centerBetweenPoints,
  clampLightboxScale,
  distanceBetweenPoints,
  DRAG_THRESHOLD_PX,
  LIGHTBOX_DOUBLE_TAP_ZOOM,
  LIGHTBOX_ZOOM_STEP,
  MAX_LIGHTBOX_SCALE,
  MIN_LIGHTBOX_SCALE,
  TAP_MAX_DISTANCE_PX,
  TAP_MAX_DURATION_MS,
  translateForZoom,
  type Point,
  type Translate,
} from "@/components/ui/image-lightbox/image-lightbox-gestures";
import { imageLightboxMessages } from "@/components/ui/image-lightbox/image-lightbox.messages";

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

type PinchState = {
  startDistance: number;
  startScale: number;
  startTranslate: Translate;
  center: Point;
};

type TapState = {
  time: number;
  x: number;
  y: number;
};

function ImageLightboxViewport({ alt, imageUrl, markers = [] }: ImageLightboxViewportProps) {
  const intl = useIntl();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(MIN_LIGHTBOX_SCALE);
  const [translate, setTranslate] = useState<Translate>({ x: 0, y: 0 });
  const [isGesturing, setIsGesturing] = useState(false);

  const scaleRef = useRef(scale);
  const translateRef = useRef(translate);
  const activePointersRef = useRef(new Map<number, Point>());
  const dragPointerRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const pinchStateRef = useRef<PinchState | null>(null);
  const lastTapRef = useRef<TapState | null>(null);
  const pointerStartRef = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(
    null,
  );
  const hasDraggedRef = useRef(false);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  const commitView = useCallback((nextScale: number, nextTranslate: Translate) => {
    scaleRef.current = nextScale;
    translateRef.current = nextTranslate;
    setScale(nextScale);
    setTranslate(nextTranslate);
  }, []);

  const resetView = useCallback(() => {
    commitView(MIN_LIGHTBOX_SCALE, { x: 0, y: 0 });
  }, [commitView]);

  const applyZoom = useCallback(
    (getNextScale: (currentScale: number) => number, anchor?: Point) => {
      const currentScale = scaleRef.current;
      const nextScale = clampLightboxScale(getNextScale(currentScale));
      if (nextScale === currentScale) {
        return;
      }

      if (anchor && viewportRef.current) {
        const nextTranslate = translateForZoom({
          viewportRect: viewportRef.current.getBoundingClientRect(),
          anchor,
          currentTranslate: translateRef.current,
          currentScale,
          nextScale,
        });
        commitView(nextScale, nextTranslate);
        return;
      }

      commitView(
        nextScale,
        nextScale === MIN_LIGHTBOX_SCALE ? { x: 0, y: 0 } : translateRef.current,
      );
    },
    [commitView],
  );

  const zoomIn = useCallback(() => {
    applyZoom((currentScale) => currentScale + LIGHTBOX_ZOOM_STEP);
  }, [applyZoom]);

  const zoomOut = useCallback(() => {
    applyZoom((currentScale) => currentScale - LIGHTBOX_ZOOM_STEP);
  }, [applyZoom]);

  const toggleDoubleTapZoom = useCallback(
    (anchor: Point) => {
      if (scaleRef.current > MIN_LIGHTBOX_SCALE) {
        resetView();
        return;
      }

      applyZoom(() => LIGHTBOX_DOUBLE_TAP_ZOOM, anchor);
    },
    [applyZoom, resetView],
  );

  const updatePinch = useCallback(() => {
    const pointers = [...activePointersRef.current.values()];
    const pinchState = pinchStateRef.current;
    const viewport = viewportRef.current;

    if (pointers.length < 2 || !pinchState || !viewport) {
      return;
    }

    const distance = distanceBetweenPoints(pointers[0]!, pointers[1]!);
    if (distance <= 0 || pinchState.startDistance <= 0) {
      return;
    }

    const nextScale = clampLightboxScale(
      pinchState.startScale * (distance / pinchState.startDistance),
    );
    const nextTranslate = translateForZoom({
      viewportRect: viewport.getBoundingClientRect(),
      anchor: pinchState.center,
      currentTranslate: pinchState.startTranslate,
      currentScale: pinchState.startScale,
      nextScale,
    });

    commitView(nextScale, nextTranslate);
  }, [commitView]);

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
      const direction = event.deltaY < 0 ? LIGHTBOX_ZOOM_STEP : -LIGHTBOX_ZOOM_STEP;
      applyZoom((currentScale) => currentScale + direction, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [applyZoom],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    setIsGesturing(true);

    if (activePointersRef.current.size === 2) {
      const [first, second] = [...activePointersRef.current.values()];
      pinchStateRef.current = {
        startDistance: distanceBetweenPoints(first!, second!),
        startScale: scaleRef.current,
        startTranslate: translateRef.current,
        center: centerBetweenPoints(first!, second!),
      };
      dragPointerRef.current = null;
      pointerStartRef.current = null;
      hasDraggedRef.current = true;
      return;
    }

    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    };
    hasDraggedRef.current = false;
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(event.pointerId)) {
        return;
      }

      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (activePointersRef.current.size >= 2) {
        if (!pinchStateRef.current) {
          const [first, second] = [...activePointersRef.current.values()];
          pinchStateRef.current = {
            startDistance: distanceBetweenPoints(first!, second!),
            startScale: scaleRef.current,
            startTranslate: translateRef.current,
            center: centerBetweenPoints(first!, second!),
          };
        }

        updatePinch();
        return;
      }

      const pointerStart = pointerStartRef.current;
      if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - pointerStart.x;
      const deltaY = event.clientY - pointerStart.y;
      const distanceMoved = Math.hypot(deltaX, deltaY);

      if (!hasDraggedRef.current) {
        if (distanceMoved < DRAG_THRESHOLD_PX || scaleRef.current <= MIN_LIGHTBOX_SCALE) {
          return;
        }

        hasDraggedRef.current = true;
        dragPointerRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      const dragPointer = dragPointerRef.current;
      if (!dragPointer || dragPointer.pointerId !== event.pointerId) {
        return;
      }

      const frameDeltaX = event.clientX - dragPointer.x;
      const frameDeltaY = event.clientY - dragPointer.y;

      dragPointerRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };

      const nextTranslate = {
        x: translateRef.current.x + frameDeltaX,
        y: translateRef.current.y + frameDeltaY,
      };
      translateRef.current = nextTranslate;
      setTranslate(nextTranslate);
    },
    [updatePinch],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerStart = pointerStartRef.current;
      const wasPinching = pinchStateRef.current != null;

      activePointersRef.current.delete(event.pointerId);

      if (activePointersRef.current.size < 2) {
        pinchStateRef.current = null;
      }

      if (dragPointerRef.current?.pointerId === event.pointerId) {
        dragPointerRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }

      if (
        pointerStart?.pointerId === event.pointerId &&
        !hasDraggedRef.current &&
        !wasPinching &&
        activePointersRef.current.size === 0
      ) {
        const now = Date.now();
        const lastTap = lastTapRef.current;
        const tapDistance = lastTap
          ? Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y)
          : Number.POSITIVE_INFINITY;

        if (
          lastTap &&
          now - lastTap.time <= TAP_MAX_DURATION_MS &&
          tapDistance <= TAP_MAX_DISTANCE_PX
        ) {
          lastTapRef.current = null;
          toggleDoubleTapZoom({ x: event.clientX, y: event.clientY });
        } else {
          lastTapRef.current = {
            time: now,
            x: event.clientX,
            y: event.clientY,
          };
        }
      }

      if (pointerStart?.pointerId === event.pointerId) {
        pointerStartRef.current = null;
      }

      if (activePointersRef.current.size === 0) {
        setIsGesturing(false);
      }
    },
    [toggleDoubleTapZoom],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      toggleDoubleTapZoom({ x: event.clientX, y: event.clientY });
    },
    [toggleDoubleTapZoom],
  );

  return (
    <>
      <div
        ref={viewportRef}
        data-testid="image-lightbox-viewport"
        className={cn(
          "relative min-h-0 flex-1 touch-none overflow-hidden bg-black/40",
          scale > MIN_LIGHTBOX_SCALE ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
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
            className={cn(
              "relative max-h-full max-w-full will-change-transform",
              !isGesturing && "transition-transform duration-75",
            )}
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={alt}
              className="block max-h-[calc(100dvh-7rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-[calc(100vw-2rem)] object-contain select-none"
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

      <div className="flex items-center justify-center gap-1 border-t border-white/10 bg-black/60 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={zoomOut}
                disabled={scale <= MIN_LIGHTBOX_SCALE}
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
          disabled={scale === MIN_LIGHTBOX_SCALE && translate.x === 0 && translate.y === 0}
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
                disabled={scale >= MAX_LIGHTBOX_SCALE}
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
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
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
