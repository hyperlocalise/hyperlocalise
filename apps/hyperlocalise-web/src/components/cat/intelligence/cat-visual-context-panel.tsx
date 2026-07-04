"use client";

import { FormattedMessage, useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";
import type {
  CatVisualContext,
  CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";
import { cn } from "@/lib/primitives/cn";

import { catVisualContextPanelMessages } from "@/components/cat/shared/cat.messages";

function VisualContextSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl bg-muted p-3.5">
      <Skeleton className="h-3 w-32 rounded-full bg-skeleton" />
      <Skeleton className="aspect-[9/16] w-full rounded-xl bg-skeleton" />
    </div>
  );
}

function VisualContextScreenshotCard({ screenshot }: { screenshot: CatVisualContextScreenshot }) {
  const intl = useIntl();

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-background">
      {screenshot.name ? (
        <figcaption className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {screenshot.name}
        </figcaption>
      ) : null}
      <div className="relative bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshot.imageUrl}
          alt={
            screenshot.name ??
            intl.formatMessage(catVisualContextPanelMessages.screenshotAltFallback)
          }
          className="block h-auto w-full"
          loading="lazy"
          decoding="async"
        />
        {screenshot.markers.map((marker, index) => (
          <span
            key={`${screenshot.id}-${index}`}
            className={cn(
              "pointer-events-none absolute rounded-sm border-2 border-grove-300/80 bg-grove-300/15",
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
    </figure>
  );
}

export function CatVisualContextPanel({
  visualContext,
  isLoading = false,
  showPanel = false,
}: {
  visualContext?: CatVisualContext;
  isLoading?: boolean;
  showPanel?: boolean;
}) {
  if (!showPanel) {
    return null;
  }

  const screenshots = visualContext?.screenshots ?? [];

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...catVisualContextPanelMessages.title} />
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          <FormattedMessage {...catVisualContextPanelMessages.description} />
        </p>
      </div>

      {isLoading ? (
        <VisualContextSkeleton />
      ) : screenshots.length > 0 ? (
        <div className="space-y-3">
          {screenshots.map((screenshot) => (
            <VisualContextScreenshotCard key={screenshot.id} screenshot={screenshot} />
          ))}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          <FormattedMessage {...catVisualContextPanelMessages.empty} />
        </p>
      )}
    </section>
  );
}
