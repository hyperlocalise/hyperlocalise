"use client";

import { ImageIcon } from "lucide-react";

import { ImageLightbox } from "@/components/ui/image-lightbox/image-lightbox";
import { cn } from "@/lib/primitives/cn";

export function CatImagePreview({
  src,
  alt,
  className,
  emptyLabel,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  emptyLabel?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex min-h-40 items-center justify-center border border-dashed border-border bg-muted/30 text-sm text-muted-foreground",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <ImageIcon className="size-6 opacity-60" aria-hidden />
          <span>{emptyLabel ?? "No image yet"}</span>
        </div>
      </div>
    );
  }

  return (
    <ImageLightbox
      alt={alt}
      imageUrl={src}
      trigger={
        <div
          className={cn(
            "group relative overflow-hidden border border-border bg-muted/20",
            className,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- CAT asset URLs are session-authenticated API paths */}
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-80 w-auto max-w-full object-contain transition-opacity group-hover:opacity-95"
          />
          <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />
        </div>
      }
    />
  );
}
