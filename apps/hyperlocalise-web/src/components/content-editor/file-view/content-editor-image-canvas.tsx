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
import { useState } from "react";
import { Slider } from "@base-ui/react/slider";
import { useIntl } from "react-intl";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";
import type { ImageTextRegion } from "@/lib/projects/files/image-text-layers";
import { imageViewerMessages as messages } from "./content-editor-image-viewer.messages";

export function ImageCanvas({
  src,
  compareSrc,
  label,
  regions,
  selectedId,
  onSelect,
  zoom,
  reveal,
  showRegions,
  onRevealChange,
}: {
  src: string;
  compareSrc?: string | null;
  label: string;
  regions: ImageTextRegion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  zoom: number;
  reveal: number;
  showRegions: boolean;
  onRevealChange: (value: number) => void;
}) {
  const intl = useIntl();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sourceRatio, setSourceRatio] = useState(0);
  const [comparisonRatio, setComparisonRatio] = useState(0);
  const mismatched = Boolean(
    sourceRatio && comparisonRatio && Math.abs(sourceRatio - comparisonRatio) > 0.01,
  );
  return (
    <div className="min-h-72 overflow-auto bg-muted/30 p-4 sm:p-6">
      {failed ? (
        <p role="alert" className="p-6 text-sm text-destructive">
          {intl.formatMessage(messages.imageError)}
        </p>
      ) : null}
      {!loaded && !failed ? (
        <div className="flex min-h-56 items-center justify-center">
          <Spinner />
        </div>
      ) : null}
      <div
        className={cn("relative mx-auto", (!loaded || failed) && "hidden")}
        style={{ width: `${zoom}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Authenticated project asset. */}
        <img
          src={src}
          alt={label}
          className="block h-auto w-full"
          onLoad={(event) => {
            setLoaded(true);
            setSourceRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight);
          }}
          onError={() => setFailed(true)}
        />
        {compareSrc ? (
          <>
            <div
              className="pointer-events-none absolute inset-0 bg-muted"
              style={{ clipPath: `inset(0 0 0 ${reveal}%)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Authenticated project asset. */}
              <img
                src={compareSrc}
                alt=""
                className="h-full w-full object-contain"
                onError={() => setFailed(true)}
                onLoad={(event) =>
                  setComparisonRatio(
                    event.currentTarget.naturalWidth / event.currentTarget.naturalHeight,
                  )
                }
              />
            </div>
            <Slider.Root
              value={reveal}
              onValueChange={onRevealChange}
              min={0}
              max={100}
              className="pointer-events-none absolute inset-0 z-10"
              aria-label={intl.formatMessage(messages.wipePosition)}
            >
              <Slider.Control className="relative h-full w-full">
                <Slider.Thumb
                  aria-label={intl.formatMessage(messages.wipePosition)}
                  getAriaValueText={(_, value) =>
                    intl.formatMessage(messages.dividerValue, { value })
                  }
                  className="pointer-events-auto flex h-full w-10 cursor-ew-resize touch-none items-center justify-center outline-none focus-within:ring-2 focus-within:ring-ring"
                >
                  <span aria-hidden className="absolute inset-y-0 w-0.5 bg-primary shadow-sm" />
                  <span
                    aria-hidden
                    className="relative flex h-10 w-8 items-center justify-center rounded-full border border-primary bg-card text-primary shadow-sm"
                  >
                    ↔
                  </span>
                </Slider.Thumb>
              </Slider.Control>
            </Slider.Root>
          </>
        ) : null}
        {showRegions ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={compareSrc ? { clipPath: `inset(0 ${100 - reveal}% 0 0)` } : undefined}
          >
            {regions.map((region, index) => (
              <button
                key={region.id}
                type="button"
                aria-label={intl.formatMessage(messages.select, { index: index + 1 })}
                aria-pressed={selectedId === region.id}
                onClick={() => onSelect(region.id)}
                className={cn(
                  "pointer-events-auto absolute border border-primary/60 bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selectedId === region.id && "border-2 border-primary bg-primary/15",
                )}
                style={{
                  left: `${region.bounds.x * 100}%`,
                  top: `${region.bounds.y * 100}%`,
                  width: `${region.bounds.width * 100}%`,
                  height: `${region.bounds.height * 100}%`,
                }}
              >
                <span className="absolute -top-5 left-0 rounded-sm bg-primary px-1 text-xs text-primary-foreground tabular-nums">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {mismatched ? (
        <p className="pt-3 text-xs text-muted-foreground">
          {intl.formatMessage(messages.differentSizes)}
        </p>
      ) : null}
    </div>
  );
}
