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
import { Video } from "lucide-react";
import { FormattedMessage } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";

export function CatVideoPreview({
  src,
  className,
  emptyLabel,
}: {
  src?: string | null;
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
          <Video className="size-6 opacity-60" aria-hidden />
          <span>{emptyLabel ?? <FormattedMessage {...catEditorPanelMessages.videoEmpty} />}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-hidden border border-border bg-muted/20", className)}
    >
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="mx-auto max-h-80 w-auto max-w-full"
      />
    </div>
  );
}
