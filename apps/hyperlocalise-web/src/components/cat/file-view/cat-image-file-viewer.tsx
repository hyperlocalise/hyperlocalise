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
import { useIntl } from "react-intl";

import { CatImagePreview } from "@/components/cat/editor/cat-image-preview";

import { catFileViewMessages } from "./cat-file-view.messages";

export const CAT_IMAGE_FILE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";

export function CatImageFileViewerPane({
  role,
  src,
  isLoading,
}: {
  role: "source" | "target";
  src?: string | null;
  isLoading?: boolean;
}) {
  const intl = useIntl();
  const alt =
    role === "source"
      ? intl.formatMessage(catFileViewMessages.imageSourceAlt)
      : intl.formatMessage(catFileViewMessages.imageTargetAlt);
  const emptyLabel =
    role === "source"
      ? intl.formatMessage(catFileViewMessages.sourceEmpty)
      : intl.formatMessage(catFileViewMessages.targetEmpty);

  if (isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
        <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    );
  }

  return <CatImagePreview src={src} alt={alt} emptyLabel={emptyLabel} className="min-h-56" />;
}
