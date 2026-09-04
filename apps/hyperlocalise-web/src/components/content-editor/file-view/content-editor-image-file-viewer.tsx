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

import { ContentEditorImagePreview } from "@/components/content-editor/editor/content-editor-image-preview";
import { Spinner } from "@/components/ui/spinner";

import { contentEditorFileViewMessages } from "./content-editor-file-view.messages";

export const CAT_IMAGE_FILE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";

export function ContentEditorImageFileViewerPane({
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
      ? intl.formatMessage(contentEditorFileViewMessages.imageSourceAlt)
      : intl.formatMessage(contentEditorFileViewMessages.imageTargetAlt);
  const emptyLabel =
    role === "source"
      ? intl.formatMessage(contentEditorFileViewMessages.sourceEmpty)
      : intl.formatMessage(contentEditorFileViewMessages.targetEmpty);

  if (isLoading) {
    return (
      <div className="flex h-full min-h-full flex-1 items-center justify-center p-6">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-full flex-1 flex-col p-6">
      <ContentEditorImagePreview
        src={src}
        alt={alt}
        emptyLabel={emptyLabel}
        className="h-full min-h-full flex-1"
      />
    </div>
  );
}
